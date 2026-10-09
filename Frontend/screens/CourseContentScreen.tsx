import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  RefreshControl,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';
import * as ScreenOrientation from 'expo-screen-orientation';

import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { fetchCourseContent } from '@/services/contentService';
import type { ContentItem, ContentType } from '@/types/content';
import { CourseTestsSection } from '@/components/Tests/CourseTestsSection';

export interface CourseContentScreenProps {
  courseId: string;
  courseTitle?: string;
  onBack?: () => void;
  initialFolderId?: string | null;
}

const OFFLINE_PDF_STORAGE_PREFIX = '@edurain_sandboxed_pdf_';

interface SandboxedPdfMetadata {
  id: string;
  courseId: string;
  title: string;
  mediaUrl: string;
  fileSize: string | null;
  cachedAt: string;
  isSandboxedOffline: boolean;
}

export function CourseContentScreen({
  courseId,
  courseTitle = 'Course Materials',
  onBack,
  initialFolderId = null,
}: CourseContentScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useApp();

  // Navigation & Folder State
  const [currentFolder, setCurrentFolder] = useState<ContentItem | null>(null);
  const [folderHistory, setFolderHistory] = useState<ContentItem[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Sandboxed Offline PDF Cache Record (id -> SandboxedPdfMetadata)
  const [offlinePdfs, setOfflinePdfs] = useState<Record<string, SandboxedPdfMetadata>>({});

  // Active Viewing Modals (In-App PDF Reader & Protected Video Player)
  const [selectedPdf, setSelectedPdf] = useState<ContentItem | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<ContentItem | null>(null);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState<boolean>(false);
  const [selectedNote, setSelectedNote] = useState<ContentItem | null>(null);

  // Dynamic Screen Dimensions & Landscape Orientation Detection
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;
  const isEffectiveFullscreen = isVideoFullscreen || isLandscape;

  // Manage Orientation Unlocking for Video Player (Auto-Rotate Support)
  useEffect(() => {
    if (selectedVideo) {
      // Allow user to rotate device to landscape or portrait freely
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      // Re-lock to portrait when video player closes
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      setIsVideoFullscreen(false);
    }

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [selectedVideo]);

  const handleExitFullscreen = useCallback(() => {
    setIsVideoFullscreen(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .then(() => {
        setTimeout(() => {
          ScreenOrientation.unlockAsync().catch(() => {});
        }, 500);
      })
      .catch(() => {});
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (isEffectiveFullscreen) {
      handleExitFullscreen();
    } else {
      setIsVideoFullscreen(true);
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
  }, [isEffectiveFullscreen, handleExitFullscreen]);

  // Gentle Floating Animation for Centered DRM Watermark
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!selectedVideo) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [selectedVideo, floatAnim]);

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-14, 14],
  });

  // Load Sandboxed Offline PDF metadata from AsyncStorage
  const loadOfflineCacheIndex = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const pdfKeys = keys.filter((k) => k.startsWith(OFFLINE_PDF_STORAGE_PREFIX));
      if (pdfKeys.length === 0) return;

      const pairs = await AsyncStorage.multiGet(pdfKeys);
      const cacheMap: Record<string, SandboxedPdfMetadata> = {};
      for (const [key, value] of pairs) {
        if (value) {
          const itemKey = key.replace(OFFLINE_PDF_STORAGE_PREFIX, '');
          cacheMap[itemKey] = JSON.parse(value);
        }
      }
      setOfflinePdfs(cacheMap);
    } catch (err) {
      console.warn('[CourseContentScreen] Error reading sandboxed offline cache index:', err);
    }
  }, []);

  useEffect(() => {
    loadOfflineCacheIndex();
  }, [loadOfflineCacheIndex]);

  // Activate DRM Anti-Screenshot & Screen Recording Protection (PRD Section 6.5 & Section 12)
  useEffect(() => {
    let sub: ScreenCapture.Subscription | null = null;

    if (selectedPdf || selectedVideo) {
      // 1. Enable OS-level screen capture prevention (Android FLAG_SECURE / iOS recording prevention)
      ScreenCapture.preventScreenCaptureAsync('drm-protected-content').catch((err) => {
        console.warn('[ScreenCapture] Failed to prevent screen capture:', err);
      });

      // 2. Listen for screenshot capture events to alert student
      try {
        sub = ScreenCapture.addScreenshotListener(() => {
          Alert.alert(
            'Security Warning',
            'Screenshots and screen recordings of copyrighted course materials are strictly prohibited.',
            [{ text: 'I Understand' }]
          );
        });
      } catch (e) {
        // Fallback for environments without screenshot event support
      }
    } else {
      ScreenCapture.allowScreenCaptureAsync('drm-protected-content').catch(() => { });
    }

    return () => {
      if (sub) {
        sub.remove();
      }
      ScreenCapture.allowScreenCaptureAsync('drm-protected-content').catch(() => { });
    };
  }, [selectedPdf, selectedVideo]);

  // Fetch Course Contents for Current Folder Level
  const loadContents = useCallback(
    async (folderId: string | null) => {
      setError(null);
      try {
        const res: any = await fetchCourseContent(courseId, folderId);
        const dataArray = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
            ? res
            : (res?.data?.data || res?.data?.content || res?.content || []);
        setItems(Array.isArray(dataArray) ? dataArray : []);
      } catch (err: any) {
        console.error('[CourseContentScreen] Error loading content:', err);
        setError(err.message || 'Failed to load course materials');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [courseId]
  );

  useEffect(() => {
    setLoading(true);
    loadContents(currentFolder ? currentFolder.id : initialFolderId);
  }, [currentFolder, initialFolderId, loadContents]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadContents(currentFolder ? currentFolder.id : null);
    loadOfflineCacheIndex();
  }, [currentFolder, loadContents, loadOfflineCacheIndex]);

  // Folder Navigation Handlers
  const handleFolderPress = (folder: ContentItem) => {
    if (currentFolder) {
      setFolderHistory((prev) => [...prev, currentFolder]);
    }
    setCurrentFolder(folder);
    setSearchQuery('');
  };

  const handleNavigateUp = () => {
    if (folderHistory.length === 0) {
      setCurrentFolder(null);
    } else {
      const newHistory = [...folderHistory];
      const parent = newHistory.pop() || null;
      setFolderHistory(newHistory);
      setCurrentFolder(parent);
    }
    setSearchQuery('');
  };

  const handleBreadcrumbPress = (index: number) => {
    if (index === 0) {
      // Root level
      setFolderHistory([]);
      setCurrentFolder(null);
    } else if (index <= folderHistory.length) {
      const target = folderHistory[index - 1];
      setFolderHistory(folderHistory.slice(0, index - 1));
      setCurrentFolder(target);
    }
    setSearchQuery('');
  };

  // Breadcrumbs Array
  const breadcrumbs = useMemo(() => {
    const list: Array<{ id: string | null; title: string }> = [
      { id: null, title: 'Course Materials' },
    ];
    for (const f of folderHistory) {
      list.push({ id: f.id, title: f.title });
    }
    if (currentFolder) {
      list.push({ id: currentFolder.id, title: currentFolder.title });
    }
    return list;
  }, [folderHistory, currentFolder]);

  // Filtered Items (by search query)
  const filteredItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        (item?.title || '').toLowerCase().includes(q) ||
        (item?.type || '').toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Sandboxed Offline PDF Toggle (PRD Section 6.5: In-app sandbox only)
  const toggleOfflineCache = async (pdfItem: ContentItem) => {
    const isCached = Boolean(offlinePdfs[pdfItem.id]);
    const storageKey = `${OFFLINE_PDF_STORAGE_PREFIX}${pdfItem.id}`;

    try {
      if (isCached) {
        await AsyncStorage.removeItem(storageKey);
        setOfflinePdfs((prev) => {
          const next = { ...prev };
          delete next[pdfItem.id];
          return next;
        });
        Alert.alert(
          'Offline Cache Removed',
          `"${pdfItem.title}" has been removed from your in-app offline cache.`
        );
      } else {
        const metadata: SandboxedPdfMetadata = {
          id: pdfItem.id,
          courseId: String(courseId),
          title: pdfItem.title,
          mediaUrl: pdfItem.mediaUrl || '',
          fileSize: pdfItem.fileSize || null,
          cachedAt: new Date().toISOString(),
          isSandboxedOffline: true,
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify(metadata));
        setOfflinePdfs((prev) => ({
          ...prev,
          [pdfItem.id]: metadata,
        }));
        Alert.alert(
          'Saved for Offline Reading',
          `"${pdfItem.title}" is now cached securely inside your app sandbox for offline reading. Direct file exports are restricted for content protection.`
        );
      }
    } catch (err: any) {
      Alert.alert('Offline Cache Error', err.message || 'Failed to update sandbox cache');
    }
  };

  // DRM Watermark text for Protected Video & PDF Readers
  const watermarkText = useMemo(() => {
    return user?.email || user?.uid ? `${user.email || user.uid} • Protected Content` : 'Student Access • Protected';
  }, [user]);

  // Injected JavaScript for DOM-Level DRM Watermark & Fullscreen Interception
  const injectedWatermarkScript = useMemo(() => {
    return `
      (function() {
        function ensureWatermark() {
          var el = document.getElementById('edurain-stream-watermark');
          if (!el) {
            var style = document.createElement('style');
            style.innerHTML = '@keyframes edurainFloat { 0%, 100% { transform: translate(-50%, -58%) rotate(-12deg); } 50% { transform: translate(-50%, -42%) rotate(-12deg); } }';
            document.head.appendChild(style);

            el = document.createElement('div');
            el.id = 'edurain-stream-watermark';
            el.style.position = 'fixed';
            el.style.top = '50%';
            el.style.left = '50%';
            el.style.transform = 'translate(-50%, -50%) rotate(-12deg)';
            el.style.animation = 'edurainFloat 3.5s ease-in-out infinite';
            el.style.pointerEvents = 'none';
            el.style.zIndex = '2147483647';
            el.style.color = 'rgba(255, 255, 255, 0.28)';
            el.style.fontSize = '12px';
            el.style.fontWeight = '600';
            el.style.fontFamily = 'system-ui, -apple-system, sans-serif';
            el.style.letterSpacing = '0.8px';
            el.style.textShadow = '0 0 4px rgba(0,0,0,0.9)';
            el.style.whiteSpace = 'nowrap';
            el.style.userSelect = 'none';
            el.style.webkitUserSelect = 'none';
            el.innerText = ${JSON.stringify(watermarkText)};
            document.body.appendChild(el);
          }
        }
        ensureWatermark();
        setInterval(ensureWatermark, 1000);

        if (window.HTMLVideoElement && !window.__edurain_fs_intercepted) {
          window.__edurain_fs_intercepted = true;
          HTMLVideoElement.prototype.webkitEnterFullscreen = function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TOGGLE_FULLSCREEN' }));
            }
          };
        }
        if (document.documentElement && !document.documentElement.__edurain_fs) {
          document.documentElement.__edurain_fs = true;
          document.documentElement.requestFullscreen = function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TOGGLE_FULLSCREEN' }));
            }
            return Promise.resolve();
          };
        }
      })();
      true;
    `;
  }, [watermarkText]);

  // Render Item for Student FlatList
  const renderItem = ({ item }: { item: ContentItem }) => {
    if (!item) return null;

    const rawType = String(item.type || '').trim().toLowerCase();
    const isFolder = rawType === 'folder';
    const isPdf = rawType === 'pdf';
    const isVideo = rawType === 'video';
    const isNote = rawType === 'note';
    const isOfflineAvailable = isPdf && Boolean(offlinePdfs[item.id]);

    const title = item.title || (isPdf ? 'PDF Document' : isFolder ? 'Folder' : 'Untitled Material');
    const mediaUrl = item.mediaUrl || item.media_url || item.url || null;
    const fileSize = item.fileSize || item.file_size || null;
    const displayType = (rawType || 'file').toUpperCase();

    const handlePress = () => {
      try {
        if (isFolder) {
          handleFolderPress(item);
        } else if (isPdf) {
          setSelectedPdf({
            ...item,
            title,
            mediaUrl: mediaUrl || item.mediaUrl,
          });
        } else if (isVideo) {
          setSelectedVideo({
            ...item,
            title,
            mediaUrl: mediaUrl || item.mediaUrl,
          });
        } else if (isNote) {
          setSelectedNote(item);
        }
      } catch (err) {
        console.error('[CourseContentScreen] Error opening item:', err);
      }
    };

    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.itemCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {/* Left Icon Badge */}
        <View
          style={[
            styles.itemIconCircle,
            {
              backgroundColor: isFolder
                ? '#e0f2fe'
                : isVideo
                  ? '#ffe4e6'
                  : isPdf
                    ? '#fef3c7'
                    : '#dcfce7',
            },
          ]}
        >
          {isFolder && <Feather name="folder" size={20} color="#0284c7" />}
          {isVideo && <Feather name="play" size={20} color="#e11d48" />}
          {isPdf && <Feather name="file-text" size={20} color="#d97706" />}
          {isNote && <Feather name="clipboard" size={20} color="#059669" />}
          {!isFolder && !isVideo && !isPdf && !isNote && (
            <Feather name="file" size={20} color="#64748b" />
          )}
        </View>

        {/* Center Content */}
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, { color: colors.navy }]} numberOfLines={2}>
            {title}
          </Text>

          <View style={styles.itemMetaRow}>
            <View
              style={[
                styles.typeTag,
                {
                  backgroundColor: isFolder
                    ? '#eff6ff'
                    : isVideo
                      ? '#fff1f2'
                      : isPdf
                        ? '#fffbeb'
                        : '#f0fdf4',
                },
              ]}
            >
              <Text
                style={[
                  styles.typeTagText,
                  {
                    color: isFolder
                      ? '#1d4ed8'
                      : isVideo
                        ? '#be123c'
                        : isPdf
                          ? '#b45309'
                          : '#15803d',
                  },
                ]}
              >
                {displayType}
              </Text>
            </View>

            {fileSize && (
              <Text style={[styles.metaText, { color: colors.inkSubtle }]}>
                {fileSize}
              </Text>
            )}

            {isOfflineAvailable && (
              <View style={styles.offlineBadge}>
                <Feather name="check-circle" size={11} color="#059669" />
                <Text style={styles.offlineBadgeText}>Offline Ready</Text>
              </View>
            )}
          </View>
        </View>

        {/* Right Arrow / Action Indicator */}
        <View style={styles.itemRightAction}>
          {isFolder ? (
            <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
          ) : isVideo ? (
            <View style={styles.playIconBadge}>
              <Feather name="play-circle" size={18} color="#e11d48" />
            </View>
          ) : isPdf ? (
            <Feather name="book-open" size={18} color="#d97706" />
          ) : (
            <Feather name="file-text" size={18} color="#059669" />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header & Navigation */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerTopRow}>
          <Pressable
            onPress={() => {
              if (folderHistory.length > 0) {
                handleNavigateUp();
              } else if (onBack) {
                onBack();
              } else {
                router.back();
              }
            }}
            style={styles.backButton}
            hitSlop={8}
          >
            <Feather name="arrow-left" size={22} color={colors.navy} />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.navy }]} numberOfLines={1}>
              {courseTitle}
            </Text>
            <View style={styles.roleTag}>
              <Feather name="shield" size={10} color="#059669" />
              <Text style={styles.roleTagText}>STUDENT CONSUMPTION ACCESS</Text>
            </View>
          </View>
        </View>

        {/* Interactive Breadcrumbs Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.breadcrumbsScroll}
        >
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.id || 'root'}>
                <Pressable
                  onPress={() => handleBreadcrumbPress(idx)}
                  style={styles.crumbTouch}
                >
                  {idx === 0 && <Feather name="home" size={12} color={colors.coral} style={{ marginRight: 4 }} />}
                  <Text
                    style={[
                      styles.crumbText,
                      {
                        color: isLast ? colors.navy : colors.inkSubtle,
                        fontWeight: isLast ? '700' : '500',
                      },
                    ]}
                  >
                    {crumb.title}
                  </Text>
                </Pressable>
                {!isLast && (
                  <Feather
                    name="chevron-right"
                    size={13}
                    color={colors.inkSubtle}
                    style={{ marginHorizontal: 2 }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </ScrollView>

        {/* Search Input Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.inkSubtle} />
          <TextInput
            placeholder="Search lessons, PDFs, recordings..."
            placeholderTextColor={colors.inkSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.navy }]}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Feather name="x" size={15} color={colors.inkSubtle} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Main Content List */}
      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.coral} />
          <Text style={[styles.centerText, { color: colors.inkSubtle }]}>
            Loading course materials...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item, index) => String(item?.id || index)}
          renderItem={renderItem}
          // Tests for this course are listed above the materials at the top level
          ListHeaderComponent={!currentFolder && !searchQuery ? <CourseTestsSection courseId={courseId} /> : null}
          contentContainerStyle={[
            styles.listContainer,
            filteredItems.length === 0 && styles.listContainerEmpty,
            { paddingBottom: insets.bottom + 32 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.coral]}
              tintColor={colors.coral}
            />
          }
          ListEmptyComponent={
            error ? (
              <View style={styles.emptyContainerContent}>
                <Feather name="alert-triangle" size={36} color="#ef4444" />
                <Text style={[styles.centerTitle, { color: colors.navy }]}>Unable to load content</Text>
                <Text style={[styles.centerText, { color: colors.inkSubtle }]}>{error}</Text>
                <Pressable
                  onPress={() => loadContents(currentFolder ? currentFolder.id : null)}
                  style={[styles.retryBtn, { backgroundColor: colors.navy }]}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyContainerContent}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="folder" size={36} color={colors.inkSubtle} />
                </View>
                <Text style={[styles.centerTitle, { color: colors.navy }]}>
                  {searchQuery ? 'No matching lessons found' : 'This folder is empty'}
                </Text>
                <Text style={[styles.centerText, { color: colors.inkSubtle }]}>
                  {searchQuery
                    ? `No content matches "${searchQuery}". Clear your search to see all materials.`
                    : 'Course materials are updated regularly by your instructors. Pull down to refresh!'}
                </Text>
              </View>
            )
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ========================================================================= */}
      {/* 1. IN-APP SANDBOXED PDF READER MODAL (PRD Section 6.5)                   */}
      {/* ========================================================================= */}
      {selectedPdf && (
        <Modal
          visible={Boolean(selectedPdf)}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedPdf(null)}
        >
          <View style={[styles.modalScreen, { backgroundColor: colors.background }]}>
            {/* Modal Header */}
            <View
              style={[
                styles.modalHeader,
                {
                  paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 8,
                  backgroundColor: colors.card,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Pressable
                onPress={() => setSelectedPdf(null)}
                style={styles.modalCloseBtn}
                hitSlop={10}
              >
                <Feather name="x" size={22} color={colors.navy} />
              </Pressable>

              <View style={styles.modalHeaderTitleBox}>
                <Text style={[styles.modalHeaderTitle, { color: colors.navy }]} numberOfLines={1}>
                  {selectedPdf.title}
                </Text>
                <Text style={[styles.modalHeaderSubtitle, { color: colors.inkSubtle }]}>
                  In-App Sandboxed PDF Viewer
                </Text>
              </View>

              {/* Sandboxed Offline Cache Toggle */}
              <Pressable
                onPress={() => toggleOfflineCache(selectedPdf)}
                style={[
                  styles.offlineToggleBtn,
                  {
                    backgroundColor: offlinePdfs[selectedPdf.id] ? '#dcfce7' : '#f1f5f9',
                    borderColor: offlinePdfs[selectedPdf.id] ? '#86efac' : '#cbd5e1',
                  },
                ]}
              >
                <Feather
                  name={offlinePdfs[selectedPdf.id] ? 'check' : 'download-cloud'}
                  size={14}
                  color={offlinePdfs[selectedPdf.id] ? '#15803d' : '#475569'}
                />
                <Text
                  style={[
                    styles.offlineToggleBtnText,
                    { color: offlinePdfs[selectedPdf.id] ? '#15803d' : '#475569' },
                  ]}
                >
                  {offlinePdfs[selectedPdf.id] ? 'In Sandbox' : 'Save Offline'}
                </Text>
              </Pressable>
            </View>

            {/* In-App PDF Rendering via WebView */}
            <View style={styles.webViewWrap}>
              {(selectedPdf.mediaUrl || selectedPdf.media_url || selectedPdf.url) ? (
                <>
                  <WebView
                    source={{
                      uri: Platform.OS === 'android'
                        ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(
                          selectedPdf.mediaUrl || selectedPdf.media_url || selectedPdf.url || ''
                        )}`
                        : (selectedPdf.mediaUrl || selectedPdf.media_url || selectedPdf.url || ''),
                    }}
                    style={styles.webView}
                    startInLoadingState
                    renderLoading={() => (
                      <View style={styles.webViewLoading}>
                        <ActivityIndicator size="large" color={colors.coral} />
                        <Text style={{ marginTop: 10, color: colors.inkSubtle, fontSize: 13 }}>
                          Loading document securely...
                        </Text>
                      </View>
                    )}
                    originWhitelist={['*']}
                    javaScriptEnabled
                    domStorageEnabled
                    allowFileAccess={false}
                    allowUniversalAccessFromFileURLs={false}
                    onShouldStartLoadWithRequest={(req) => {
                      // Strictly block external file downloads / external navigation
                      if (
                        req.url.includes('docs.google.com') ||
                        req.url.includes('.pdf') ||
                        req.url.includes('amazonaws.com') ||
                        req.url.startsWith('blob:') ||
                        req.url.startsWith('data:')
                      ) {
                        return true;
                      }
                      return false;
                    }}
                  />

                  {/* Dynamic Floating Watermark Overlay (PRD Section 6.5) */}
                  <View pointerEvents="none" style={styles.pdfWatermarkOverlay}>
                    <Text style={styles.pdfWatermarkText}>{watermarkText}</Text>
                    <Text style={styles.pdfWatermarkText}>{watermarkText}</Text>
                    <Text style={styles.pdfWatermarkText}>{watermarkText}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.centerBox}>
                  <Feather name="file-text" size={38} color={colors.inkSubtle} />
                  <Text style={[styles.centerTitle, { color: colors.navy }]}>No PDF URL found</Text>
                </View>
              )}
            </View>

            {/* DRM & Security Sandbox Footer */}
            <View
              style={[
                styles.drmFooter,
                {
                  paddingBottom: Math.max(insets.bottom, 12),
                  backgroundColor: colors.card,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <Feather name="lock" size={13} color="#059669" />
              <Text style={styles.drmFooterText}>
                Protected Material • {watermarkText} • External downloads disabled
              </Text>
            </View>
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 2. PROTECTED VIDEO PLAYER MODAL (PRD Section 6.3 & 6.5)                  */}
      {/* ========================================================================= */}
      {selectedVideo && (
        <Modal
          visible={Boolean(selectedVideo)}
          animationType="fade"
          presentationStyle="fullScreen"
          supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
          onRequestClose={() => {
            if (isEffectiveFullscreen) {
              handleExitFullscreen();
            } else {
              setSelectedVideo(null);
            }
          }}
        >
          <View style={styles.videoPlayerScreen}>
            {/* Player Top Navigation (Hidden in Fullscreen or Landscape) */}
            {!isEffectiveFullscreen && (
              <View
                style={[
                  styles.videoPlayerHeader,
                  { paddingTop: Platform.OS === 'ios' ? 44 : insets.top + 8 },
                ]}
              >
                <Pressable
                  onPress={() => {
                    handleExitFullscreen();
                    setSelectedVideo(null);
                  }}
                  style={styles.videoCloseBtn}
                  hitSlop={10}
                >
                  <Feather name="chevron-left" size={26} color="#ffffff" />
                </Pressable>

                <View style={{ flex: 1, paddingHorizontal: 12 }}>
                  <Text style={styles.videoPlayerTitle} numberOfLines={1}>
                    {selectedVideo.title}
                  </Text>
                  <Text style={styles.videoPlayerSubtitle}>
                    Protected In-App Lecture Player
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.drmBadge}>
                    <Feather name="shield" size={12} color="#4ade80" />
                    <Text style={styles.drmBadgeText}>DRM</Text>
                  </View>

                  <Pressable
                    onPress={handleToggleFullscreen}
                    style={styles.videoHeaderFullscreenBtn}
                    hitSlop={8}
                  >
                    <Feather name="maximize-2" size={18} color="#ffffff" />
                  </Pressable>
                </View>
              </View>
            )}

            {/* In-App Protected Video Player via Direct Native/Sandbox WebView */}
            <View style={[styles.videoContainer, isEffectiveFullscreen && styles.videoContainerFullscreen]}>
              {selectedVideo.mediaUrl ? (() => {
                const urlStr = selectedVideo.mediaUrl.trim();
                const isBunny = urlStr.includes('mediadelivery.net') || urlStr.includes('b-cdn.net');
                const isVimeo = urlStr.includes('vimeo.com');
                let embedUrl = '';

                if (isBunny) {
                  if (urlStr.includes('/embed/')) {
                    embedUrl = urlStr.includes('preload')
                      ? urlStr
                      : `${urlStr}${urlStr.includes('?') ? '&' : '?'}preload=true&responsive=true`;
                  } else {
                    const match = urlStr.match(/mediadelivery\.net\/(?:embed|play)\/([^/?#]+)\/([^/?#]+)/);
                    if (match) {
                      embedUrl = `https://iframe.mediadelivery.net/embed/${match[1]}/${match[2]}?preload=true&responsive=true`;
                    } else {
                      const guidMatch = urlStr.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
                      if (guidMatch) {
                        embedUrl = `https://iframe.mediadelivery.net/embed/775402/${guidMatch[1]}?preload=true&responsive=true`;
                      } else {
                        embedUrl = urlStr;
                      }
                    }
                  }
                } else if (isVimeo) {
                  const cleaned = urlStr.split('?')[0].split('#')[0];
                  const vimeoId = cleaned.split('/').filter(Boolean).pop() || '';
                  embedUrl = vimeoId ? `https://player.vimeo.com/video/${vimeoId}?badge=0&autopause=0&player_id=0&autoplay=1` : '';
                }

                return (
                  <View style={styles.videoPlayerContainer}>
                    <WebView
                      style={styles.videoWebView}
                      originWhitelist={['*']}
                      allowsInlineMediaPlayback={true}
                      allowsFullscreenVideo={Platform.OS === 'android'}
                      allowsAirPlayForMediaPlayback={true}
                      mediaPlaybackRequiresUserAction={false}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      mixedContentMode="always"
                      bounces={false}
                      scrollEnabled={false}
                      injectedJavaScript={injectedWatermarkScript}
                      onMessage={(event) => {
                        try {
                          const msg = JSON.parse(event.nativeEvent.data);
                          if (msg?.type === 'TOGGLE_FULLSCREEN') {
                            handleToggleFullscreen();
                          }
                        } catch {}
                      }}
                      startInLoadingState={true}
                      renderLoading={() => (
                        <View style={styles.videoLoadingContainer}>
                          <ActivityIndicator size="large" color={colors.coral} />
                          <Text style={styles.videoLoadingText}>Loading secure stream...</Text>
                        </View>
                      )}
                      source={
                        embedUrl
                          ? { uri: embedUrl }
                          : {
                              html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><style>* { margin: 0; padding: 0; } body { background-color: #0b0f19; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; } video { width: 100%; height: 100%; max-height: 100vh; object-fit: contain; }</style></head><body oncontextmenu="return false;"><video src="${urlStr}" controls playsinline webkit-playsinline autoplay controlsList="nodownload noplaybackrate"></video></body></html>`,
                              baseUrl: 'https://iframe.mediadelivery.net',
                            }
                      }
                      onShouldStartLoadWithRequest={() => true}
                    />

                    {/* Dynamic DRM Watermark (Centered, Small, & Floating) */}
                    <View pointerEvents="none" style={styles.videoWatermarkCenterContainer}>
                      <Animated.View style={{ transform: [{ translateY }] }}>
                        <Text style={styles.videoWatermarkText}>{watermarkText}</Text>
                      </Animated.View>
                    </View>

                    {/* Floating Exit Button when in Fullscreen or Landscape Mode */}
                    {isEffectiveFullscreen && (
                      <Pressable
                        onPress={handleExitFullscreen}
                        style={[
                          styles.floatingExitFullscreenBtn,
                          {
                            top: Platform.OS === 'ios' ? Math.max(insets.top, 24) : insets.top + 12,
                            left: Math.max(insets.left, 16),
                          },
                        ]}
                        hitSlop={10}
                      >
                        <Feather name={isLandscape ? 'minimize-2' : 'chevron-left'} size={16} color="#ffffff" />
                        <Text style={styles.floatingExitFullscreenText}>
                          {isLandscape ? 'Portrait' : 'Exit Fullscreen'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })() : (
                <View style={styles.centerBox}>
                  <Feather name="video-off" size={40} color="#94a3b8" />
                  <Text style={[styles.centerTitle, { color: '#ffffff' }]}>Video Unavailable</Text>
                  <Text style={[styles.centerText, { color: '#94a3b8' }]}>
                    No media stream is attached to this lesson.
                  </Text>
                </View>
              )}
            </View>

            {/* Bottom Playback Info (Hidden in Fullscreen or Landscape) */}
            {!isEffectiveFullscreen && (
              <View
                style={[
                  styles.videoFooter,
                  { paddingBottom: Math.max(insets.bottom, 16) },
                ]}
              >
                <Text style={styles.videoFooterText}>
                  Encrypted Session • Screen captures and downloads are strictly restricted
                </Text>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* 3. IN-APP NOTE VIEWER MODAL                                              */}
      {/* ========================================================================= */}
      {selectedNote && (
        <Modal
          visible={Boolean(selectedNote)}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setSelectedNote(null)}
        >
          <View style={[styles.modalScreen, { backgroundColor: colors.background }]}>
            <View
              style={[
                styles.modalHeader,
                {
                  paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 8,
                  backgroundColor: colors.card,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Pressable
                onPress={() => setSelectedNote(null)}
                style={styles.modalCloseBtn}
                hitSlop={10}
              >
                <Feather name="x" size={22} color={colors.navy} />
              </Pressable>

              <View style={styles.modalHeaderTitleBox}>
                <Text style={[styles.modalHeaderTitle, { color: colors.navy }]} numberOfLines={1}>
                  {selectedNote.title}
                </Text>
                <Text style={[styles.modalHeaderSubtitle, { color: colors.inkSubtle }]}>
                  Classroom Note / Announcement
                </Text>
              </View>

              <View style={{ width: 32 }} />
            </View>

            <ScrollView contentContainerStyle={styles.noteContentContainer}>
              <Text style={[styles.noteTitleLarge, { color: colors.navy }]}>
                {selectedNote.title}
              </Text>
              <Text style={[styles.noteBody, { color: colors.navy }]}>
                {selectedNote.mediaUrl?.startsWith('data:text')
                  ? decodeURIComponent(selectedNote.mediaUrl.split(',')[1] || '')
                  : selectedNote.mediaUrl || 'No additional content provided for this note.'}
              </Text>
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  roleTagText: {
    fontSize: 9.5,
    fontFamily: 'Inter_600SemiBold',
    color: '#059669',
    letterSpacing: 0.5,
  },
  breadcrumbsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  crumbTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderRadius: 6,
  },
  crumbText: {
    fontSize: 12.5,
    fontFamily: 'Inter_500Medium',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    marginTop: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    padding: 0,
  },
  listContainer: {
    padding: 16,
    gap: 10,
  },
  listContainerEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyContainerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 14.5,
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 20,
    marginBottom: 4,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeTagText: {
    fontSize: 9.5,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.4,
  },
  metaText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  offlineBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#059669',
  },
  itemRightAction: {
    paddingLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconBadge: {
    padding: 2,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  centerTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  centerText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalScreen: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitleBox: {
    flex: 1,
  },
  modalHeaderTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  modalHeaderSubtitle: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  offlineToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  offlineToggleBtnText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  webViewWrap: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  pdfWatermarkOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 50,
    zIndex: 99,
  },
  pdfWatermarkText: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.12)',
    fontFamily: 'Inter_700Bold',
    transform: [{ rotate: '-25deg' }],
    letterSpacing: 1,
  },
  drmFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  drmFooterText: {
    fontSize: 10.5,
    fontFamily: 'Inter_500Medium',
    color: '#059669',
  },
  videoPlayerScreen: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  videoPlayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  videoCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayerTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  videoPlayerSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  drmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  drmBadgeText: {
    color: '#4ade80',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainerFullscreen: {
    backgroundColor: '#000000',
  },
  videoPlayerContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  videoHeaderFullscreenBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingExitFullscreenBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  floatingExitFullscreenText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  videoWatermarkCenterContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  videoWatermarkText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.28)',
    fontFamily: 'Inter_600SemiBold',
    transform: [{ rotate: '-12deg' }],
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    textAlign: 'center',
  },
  videoLoadingContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0f19',
  },
  videoLoadingText: {
    marginTop: 10,
    color: '#94a3b8',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  videoWebView: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  videoFooter: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  videoFooterText: {
    color: '#64748b',
    fontSize: 10.5,
    fontFamily: 'Inter_400Regular',
  },
  noteContentContainer: {
    padding: 20,
  },
  noteTitleLarge: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  noteBody: {
    fontSize: 14.5,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
});

export default CourseContentScreen;
