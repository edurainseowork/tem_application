import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import colors from '../constants/colors';
import { useCourseContentManager } from '../hooks/useCourseContentManager';
import { useMediaUploader, formatFileSize } from '../hooks/useMediaUploader';
import {
  createContentNode,
  updateContentNode,
  getPresignedUploadUrl,
  uploadFileToS3,
} from '../services/contentService';
import type { ContentItem, ContentType } from '../types/content';

export interface CourseContentManagerScreenProps {
  courseId?: string;
  courseTitle?: string;
  onBack?: () => void;
}

export function CourseContentManagerScreen(props: CourseContentManagerScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; courseId?: string; title?: string }>();

  // Determine active course parameters
  const effectiveCourseId = String(props.courseId || params.courseId || params.id || '10');
  const courseTitle = props.courseTitle || params.title || 'Class 11th PCB';

  // Navigation & Content Management Hook
  const {
    currentFolder,
    folderHistory,
    items,
    loading,
    error: managerError,
    navigateIntoFolder,
    navigateUp,
    navigateToBreadcrumb,
    reorderItem,
    refresh,
    createFolder,
    deleteItem,
    setError: setManagerError,
  } = useCourseContentManager(effectiveCourseId);

  // Media Uploader Hook
  const {
    uploading,
    uploadProgress,
    currentFileName,
    error: uploaderError,
    pickAndUploadPdf,
    pickAndUploadVideo,
    cancelUpload,
  } = useMediaUploader();

  // Modals state
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [folderTitleInput, setFolderTitleInput] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState(false);
  const [noteTitleInput, setNoteTitleInput] = useState('');
  const [noteContentInput, setNoteContentInput] = useState('');
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameTargetItem, setRenameTargetItem] = useState<ContentItem | null>(null);
  const [renameTitleInput, setRenameTitleInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const [activeMenuTarget, setActiveMenuTarget] = useState<ContentItem | null>(null);
  const [isReplacingFile, setIsReplacingFile] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState(0);

  // Handle Back
  const handleBack = useCallback(() => {
    if (folderHistory.length > 0) {
      navigateUp();
    } else if (props.onBack) {
      props.onBack();
    } else {
      router.back();
    }
  }, [folderHistory.length, navigateUp, props.onBack, router]);

  // Create Folder Handler
  const handleCreateFolder = useCallback(async () => {
    if (!folderTitleInput.trim()) return;
    setIsCreatingFolder(true);
    try {
      await createFolder(folderTitleInput.trim());
      setFolderTitleInput('');
      setIsAddFolderModalOpen(false);
    } catch (err: any) {
      console.error('Failed to create folder:', err);
    } finally {
      setIsCreatingFolder(false);
    }
  }, [createFolder, folderTitleInput]);

  // Create Note Handler
  const handleCreateNote = useCallback(async () => {
    if (!noteTitleInput.trim()) return;
    setIsCreatingNote(true);
    try {
      await createContentNode({
        courseId: effectiveCourseId,
        parentId: currentFolder ? currentFolder.id : null,
        title: noteTitleInput.trim(),
        type: 'note',
        mediaUrl: noteContentInput.trim() || undefined,
      });
      setNoteTitleInput('');
      setNoteContentInput('');
      setIsAddNoteModalOpen(false);
      await refresh();
    } catch (err: any) {
      console.error('Failed to create note:', err);
    } finally {
      setIsCreatingNote(false);
    }
  }, [createContentNode, currentFolder, effectiveCourseId, noteContentInput, noteTitleInput, refresh]);

  // Rename Item Handler
  const handleRename = useCallback(async () => {
    if (!renameTargetItem || !renameTitleInput.trim()) return;
    setIsRenaming(true);
    try {
      await updateContentNode(renameTargetItem.id, {
        title: renameTitleInput.trim(),
      });
      setIsRenameModalOpen(false);
      setRenameTargetItem(null);
      setRenameTitleInput('');
      await refresh();
    } catch (err: any) {
      console.error('Failed to rename item:', err);
    } finally {
      setIsRenaming(false);
    }
  }, [refresh, renameTargetItem, renameTitleInput]);

  // Replace File Handler
  const handleReplaceFile = useCallback(async (item: ContentItem) => {
    setActiveMenuTarget(null);
    try {
      const pickerTypes =
        item.type === 'pdf'
          ? ['application/pdf']
          : item.type === 'video'
          ? ['video/*']
          : ['application/pdf', 'video/*'];

      const result = await DocumentPicker.getDocumentAsync({
        type: pickerTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const fileName = asset.name || `replaced_${Date.now()}`;
      let mimeType = asset.mimeType || (item.type === 'pdf' ? 'application/pdf' : 'video/mp4');

      setIsReplacingFile(true);
      setReplaceProgress(10);

      // 1. Get Presigned URL
      const presigned = await getPresignedUploadUrl(fileName, mimeType, effectiveCourseId);
      setReplaceProgress(40);

      // 2. Upload to S3
      await uploadFileToS3(presigned.uploadUrl, asset.uri, mimeType);
      setReplaceProgress(80);

      // 3. Update Content Node
      await updateContentNode(item.id, {
        mediaUrl: presigned.fileUrl,
        fileSize: formatFileSize(asset.size),
      });
      setReplaceProgress(100);

      await refresh();
    } catch (err: any) {
      console.error('Failed to replace file:', err);
      Alert.alert('Error', err.message || 'Failed to replace file');
    } finally {
      setIsReplacingFile(false);
      setReplaceProgress(0);
    }
  }, [effectiveCourseId, refresh]);

  // Delete Item Confirmation Handler
  const handleDeletePrompt = useCallback((item: ContentItem) => {
    setActiveMenuTarget(null);

    const message =
      item.type === 'folder'
        ? `Are you sure you want to delete "${item.title}"? All files and folders inside will be deleted.`
        : `Are you sure you want to delete "${item.title}"?`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(message);
      if (confirmed) {
        deleteItem(item.id);
      }
    } else {
      Alert.alert('Delete Item', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteItem(item.id),
        },
      ]);
    }
  }, [deleteItem]);

  // Upload PDF Handler
  const handleAddPdf = useCallback(async () => {
    try {
      const result = await pickAndUploadPdf(
        effectiveCourseId,
        currentFolder ? currentFolder.id : null
      );
      if (result) {
        await refresh();
      }
    } catch (err: any) {
      console.error('Error adding PDF:', err);
    }
  }, [currentFolder, effectiveCourseId, pickAndUploadPdf, refresh]);

  // Upload Video Handler
  const handleAddVideo = useCallback(async () => {
    try {
      const result = await pickAndUploadVideo(
        effectiveCourseId,
        currentFolder ? currentFolder.id : null
      );
      if (result) {
        await refresh();
      }
    } catch (err: any) {
      console.error('Error adding Video:', err);
    }
  }, [currentFolder, effectiveCourseId, pickAndUploadVideo, refresh]);

  // Render type-specific icon and badges
  const renderItemVisuals = useCallback((item: ContentItem) => {
    const rawType = String(item?.type || '').trim().toLowerCase();
    const fileSize = item?.fileSize || item?.file_size || null;

    switch (rawType) {
      case 'folder':
        return {
          icon: <Ionicons name="folder" size={22} color="#2563eb" />,
          bgColor: '#eff6ff',
          badgeText: 'Folder',
          badgeBg: '#dbeafe',
          badgeColor: '#1d4ed8',
        };
      case 'video':
        return {
          icon: <Ionicons name="play" size={20} color="#dc2626" />,
          bgColor: '#fef2f2',
          badgeText: fileSize ? `Video • ${fileSize}` : 'Video',
          badgeBg: '#fee2e2',
          badgeColor: '#b91c1c',
        };
      case 'pdf':
        return {
          icon: <Ionicons name="document-text" size={21} color="#ea580c" />,
          bgColor: '#fff7ed',
          badgeText: fileSize ? `PDF • ${fileSize}` : 'PDF Document',
          badgeBg: '#ffedd5',
          badgeColor: '#c2410c',
        };
      case 'note':
        return {
          icon: <Ionicons name="clipboard" size={20} color="#059669" />,
          bgColor: '#ecfdf5',
          badgeText: 'Study Note',
          badgeBg: '#d1fae5',
          badgeColor: '#047857',
        };
      case 'quiz':
        return {
          icon: <Ionicons name="help-circle" size={21} color="#7c3aed" />,
          bgColor: '#f5f3ff',
          badgeText: 'Quiz',
          badgeBg: '#ede9fe',
          badgeColor: '#6d28d9',
        };
      default:
        return {
          icon: <Ionicons name="document" size={20} color="#64748b" />,
          bgColor: '#f1f5f9',
          badgeText: 'Content',
          badgeBg: '#e2e8f0',
          badgeColor: '#475569',
        };
    }
  }, []);

  // Content Item Card Renderer
  const renderContentItem = useCallback(
    ({ item, index }: { item: ContentItem; index: number }) => {
      const visuals = renderItemVisuals(item);
      const isFirst = index === 0;
      const isLast = index === items.length - 1;

      return (
        <View style={styles.cardContainer}>
          {/* Card Main Surface */}
          <Pressable
            style={styles.cardMain}
            onPress={() => {
              if (item.type === 'folder') {
                navigateIntoFolder(item);
              }
            }}
          >
            {/* Reorder Buttons Column */}
            <View style={styles.reorderColumn}>
              <Pressable
                disabled={isFirst}
                onPress={() => reorderItem(index, index - 1)}
                style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                hitSlop={6}
              >
                <Feather
                  name="chevron-up"
                  size={16}
                  color={isFirst ? '#cbd5e1' : '#475569'}
                />
              </Pressable>
              <Pressable
                disabled={isLast}
                onPress={() => reorderItem(index, index + 1)}
                style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
                hitSlop={6}
              >
                <Feather
                  name="chevron-down"
                  size={16}
                  color={isLast ? '#cbd5e1' : '#475569'}
                />
              </Pressable>
            </View>

            {/* Type-Specific Icon Box */}
            <View style={[styles.iconBox, { backgroundColor: visuals.bgColor }]}>
              {visuals.icon}
            </View>

            {/* Item Details */}
            <View style={styles.itemDetails}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: visuals.badgeBg }]}>
                  <Text style={[styles.badgeText, { color: visuals.badgeColor }]}>
                    {visuals.badgeText}
                  </Text>
                </View>
                {item.type === 'folder' && (
                  <Text style={styles.folderHint}>Tap to open</Text>
                )}
              </View>
            </View>

            {/* Action Menu Button */}
            <Pressable
              style={styles.moreButton}
              onPress={() => setActiveMenuTarget(item)}
              hitSlop={10}
            >
              <Feather name="more-vertical" size={18} color="#64748b" />
            </Pressable>
          </Pressable>
        </View>
      );
    },
    [items.length, navigateIntoFolder, renderItemVisuals, reorderItem]
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* 1. Header Bar */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={10}>
          <Feather
            name={folderHistory.length > 0 ? 'arrow-left' : 'chevron-left'}
            size={22}
            color="#14213d"
          />
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {courseTitle}
          </Text>
          <Text style={styles.headerSubtitle}>Content Builder & Manager</Text>
        </View>

        <Pressable onPress={refresh} style={styles.refreshButton} hitSlop={10}>
          <Feather name="rotate-cw" size={18} color="#14213d" />
        </Pressable>
      </View>

      {/* 2. Breadcrumbs Bar */}
      <View style={styles.breadcrumbsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.breadcrumbsContent}
        >
          {/* Root Crumb */}
          <Pressable
            onPress={() => navigateToBreadcrumb(-1)}
            style={[
              styles.breadcrumbPill,
              currentFolder === null && styles.breadcrumbPillActive,
            ]}
          >
            <Feather
              name="home"
              size={13}
              color={currentFolder === null ? '#2563eb' : '#64748b'}
            />
            <Text
              style={[
                styles.breadcrumbText,
                currentFolder === null && styles.breadcrumbTextActive,
              ]}
            >
              Root
            </Text>
          </Pressable>

          {/* Nested Crumb Trail */}
          {folderHistory.map((folder, index) => {
            const isLast = index === folderHistory.length - 1;
            return (
              <React.Fragment key={folder.id}>
                <Feather
                  name="chevron-right"
                  size={13}
                  color="#94a3b8"
                  style={styles.crumbSeparator}
                />
                <Pressable
                  onPress={() => navigateToBreadcrumb(index)}
                  style={[
                    styles.breadcrumbPill,
                    isLast && styles.breadcrumbPillActive,
                  ]}
                >
                  <Ionicons
                    name="folder-outline"
                    size={13}
                    color={isLast ? '#2563eb' : '#64748b'}
                  />
                  <Text
                    style={[
                      styles.breadcrumbText,
                      isLast && styles.breadcrumbTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {folder.title}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Main Content List */}
      {loading && items.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading course contents...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => String(item?.id || index)}
          renderItem={renderContentItem}
          contentContainerStyle={[
            styles.listContent,
            items.length === 0 && { flexGrow: 1, justifyContent: 'center' },
            { paddingBottom: insets.bottom + 90 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              colors={['#2563eb']}
              tintColor="#2563eb"
            />
          }
          ListEmptyComponent={
            managerError ? (
              <View style={styles.centerContainer}>
                <Feather name="alert-circle" size={40} color="#e05252" />
                <Text style={styles.errorText}>{managerError}</Text>
                <Pressable onPress={refresh} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="folder-open-outline" size={44} color="#94a3b8" />
                </View>
                <Text style={styles.emptyTitle}>This folder is empty</Text>
                <Text style={styles.emptySubtitle}>
                  Tap any of the actions below to upload PDFs, videos, study notes, or organize into folders. Pull down to refresh!
                </Text>
              </View>
            )
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 4. Bottom Floating Action Toolbar */}
      <View style={[styles.bottomToolbar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.toolbarInner}>
          <Pressable
            onPress={() => setIsAddFolderModalOpen(true)}
            style={({ pressed }) => [
              styles.toolbarActionBtn,
              styles.toolbarBtnFolder,
              pressed && styles.btnPressed,
            ]}
          >
            <Feather name="folder-plus" size={17} color="#2563eb" />
            <Text style={[styles.toolbarBtnText, { color: '#2563eb' }]}>+ Folder</Text>
          </Pressable>

          <Pressable
            onPress={handleAddPdf}
            style={({ pressed }) => [
              styles.toolbarActionBtn,
              styles.toolbarBtnPdf,
              pressed && styles.btnPressed,
            ]}
          >
            <Ionicons name="document-text" size={17} color="#ea580c" />
            <Text style={[styles.toolbarBtnText, { color: '#ea580c' }]}>+ PDF</Text>
          </Pressable>

          <Pressable
            onPress={handleAddVideo}
            style={({ pressed }) => [
              styles.toolbarActionBtn,
              styles.toolbarBtnVideo,
              pressed && styles.btnPressed,
            ]}
          >
            <Ionicons name="play" size={17} color="#dc2626" />
            <Text style={[styles.toolbarBtnText, { color: '#dc2626' }]}>+ Video</Text>
          </Pressable>

          <Pressable
            onPress={() => setIsAddNoteModalOpen(true)}
            style={({ pressed }) => [
              styles.toolbarActionBtn,
              styles.toolbarBtnNote,
              pressed && styles.btnPressed,
            ]}
          >
            <Ionicons name="clipboard" size={17} color="#059669" />
            <Text style={[styles.toolbarBtnText, { color: '#059669' }]}>+ Note</Text>
          </Pressable>
        </View>
      </View>

      {/* 5. Uploading Progress Overlay */}
      <Modal
        visible={uploading || isReplacingFile}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.uploadDialog}>
            <View style={styles.uploadSpinnerBox}>
              <ActivityIndicator size="large" color="#2563eb" />
            </View>

            <Text style={styles.uploadTitle}>
              {isReplacingFile ? 'Replacing File...' : 'Uploading Media Asset...'}
            </Text>

            <Text style={styles.uploadFileName} numberOfLines={1}>
              {currentFileName || 'Uploading to AWS S3 storage'}
            </Text>

            {/* Progress Bar Container */}
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${isReplacingFile ? replaceProgress : uploadProgress}%` },
                ]}
              />
            </View>

            <Text style={styles.progressPercentText}>
              {isReplacingFile ? replaceProgress : uploadProgress}% Complete
            </Text>

            {!isReplacingFile && (
              <Pressable
                onPress={cancelUpload}
                style={styles.cancelUploadButton}
                hitSlop={8}
              >
                <Text style={styles.cancelUploadText}>Cancel Upload</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* 6. Action Menu Sheet Modal */}
      <Modal
        visible={activeMenuTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveMenuTarget(null)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setActiveMenuTarget(null)}
        >
          <View style={styles.menuSheet}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle} numberOfLines={1}>
                {activeMenuTarget?.title}
              </Text>
              <Text style={styles.menuSubtitle}>
                Type: {activeMenuTarget?.type.toUpperCase()}
              </Text>
            </View>

            {/* Rename Action */}
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                if (activeMenuTarget) {
                  setRenameTargetItem(activeMenuTarget);
                  setRenameTitleInput(activeMenuTarget.title);
                  setActiveMenuTarget(null);
                  setIsRenameModalOpen(true);
                }
              }}
            >
              <Feather name="edit-2" size={18} color="#1e293b" />
              <Text style={styles.menuRowText}>Rename Item</Text>
            </Pressable>

            {/* Replace File Action (Only for PDF or Video) */}
            {activeMenuTarget &&
              (activeMenuTarget.type === 'pdf' || activeMenuTarget.type === 'video') && (
                <Pressable
                  style={styles.menuRow}
                  onPress={() => handleReplaceFile(activeMenuTarget)}
                >
                  <Feather name="refresh-cw" size={18} color="#2563eb" />
                  <Text style={[styles.menuRowText, { color: '#2563eb' }]}>
                    Replace File
                  </Text>
                </Pressable>
              )}

            {/* Delete Action */}
            {activeMenuTarget && (
              <Pressable
                style={styles.menuRow}
                onPress={() => handleDeletePrompt(activeMenuTarget)}
              >
                <Feather name="trash-2" size={18} color="#dc2626" />
                <Text style={[styles.menuRowText, { color: '#dc2626' }]}>
                  Delete Item
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.menuCancelRow}
              onPress={() => setActiveMenuTarget(null)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* 7. Add Folder Modal */}
      <Modal
        visible={isAddFolderModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddFolderModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <View style={[styles.dialogIconBox, { backgroundColor: '#eff6ff' }]}>
                <Feather name="folder-plus" size={22} color="#2563eb" />
              </View>
              <Text style={styles.dialogTitle}>Create New Folder</Text>
            </View>

            <Text style={styles.inputLabel}>Folder Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Live Class Recordings"
              placeholderTextColor="#94a3b8"
              value={folderTitleInput}
              onChangeText={setFolderTitleInput}
              autoFocus
            />

            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setIsAddFolderModalOpen(false)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleCreateFolder}
                disabled={!folderTitleInput.trim() || isCreatingFolder}
                style={[
                  styles.dialogConfirmBtn,
                  (!folderTitleInput.trim() || isCreatingFolder) &&
                    styles.dialogConfirmBtnDisabled,
                ]}
              >
                {isCreatingFolder ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.dialogConfirmText}>Create Folder</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 8. Add Note Modal */}
      <Modal
        visible={isAddNoteModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddNoteModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <View style={[styles.dialogIconBox, { backgroundColor: '#ecfdf5' }]}>
                <Ionicons name="clipboard" size={22} color="#059669" />
              </View>
              <Text style={styles.dialogTitle}>Add Study Note</Text>
            </View>

            <Text style={styles.inputLabel}>Note Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Formula Sheet & Quick Reference"
              placeholderTextColor="#94a3b8"
              value={noteTitleInput}
              onChangeText={setNoteTitleInput}
              autoFocus
            />

            <Text style={styles.inputLabel}>Note Content or URL (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Enter important notes, links, or instructions..."
              placeholderTextColor="#94a3b8"
              value={noteContentInput}
              onChangeText={setNoteContentInput}
              multiline
              numberOfLines={4}
            />

            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setIsAddNoteModalOpen(false)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleCreateNote}
                disabled={!noteTitleInput.trim() || isCreatingNote}
                style={[
                  styles.dialogConfirmBtn,
                  styles.dialogConfirmBtnGreen,
                  (!noteTitleInput.trim() || isCreatingNote) &&
                    styles.dialogConfirmBtnDisabled,
                ]}
              >
                {isCreatingNote ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.dialogConfirmText}>Save Note</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 9. Rename Modal */}
      <Modal
        visible={isRenameModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRenameModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <View style={[styles.dialogIconBox, { backgroundColor: '#f1f5f9' }]}>
                <Feather name="edit-2" size={20} color="#1e293b" />
              </View>
              <Text style={styles.dialogTitle}>Rename Item</Text>
            </View>

            <Text style={styles.inputLabel}>New Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter new title..."
              placeholderTextColor="#94a3b8"
              value={renameTitleInput}
              onChangeText={setRenameTitleInput}
              autoFocus
            />

            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setIsRenameModalOpen(false)}
                style={styles.dialogCancelBtn}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleRename}
                disabled={!renameTitleInput.trim() || isRenaming}
                style={[
                  styles.dialogConfirmBtn,
                  (!renameTitleInput.trim() || isRenaming) &&
                    styles.dialogConfirmBtnDisabled,
                ]}
              >
                {isRenaming ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.dialogConfirmText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumbsBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 8,
  },
  breadcrumbsContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    flexDirection: 'row',
  },
  breadcrumbPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    gap: 5,
  },
  breadcrumbPillActive: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  breadcrumbText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    maxWidth: 140,
  },
  breadcrumbTextActive: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  crumbSeparator: {
    marginHorizontal: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  cardContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  reorderColumn: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  reorderBtn: {
    width: 26,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reorderBtnDisabled: {
    opacity: 0.35,
    backgroundColor: '#f1f5f9',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  folderHint: {
    fontSize: 11,
    color: '#94a3b8',
  },
  moreButton: {
    padding: 8,
    borderRadius: 8,
  },
  bottomToolbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 8,
  },
  toolbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toolbarActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  toolbarBtnFolder: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  toolbarBtnPdf: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  toolbarBtnVideo: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  toolbarBtnNote: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  toolbarBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  uploadDialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  uploadSpinnerBox: {
    marginBottom: 16,
  },
  uploadTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  uploadFileName: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  progressPercentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 16,
  },
  cancelUploadButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelUploadText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 6,
  },
  menuHeader: {
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 6,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 12,
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0f172a',
  },
  menuCancelRow: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dialogIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 6,
  },
  textInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 10,
  },
  textArea: {
    height: 84,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  dialogActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  dialogCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  dialogCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  dialogConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  dialogConfirmBtnGreen: {
    backgroundColor: '#059669',
  },
  dialogConfirmBtnDisabled: {
    opacity: 0.5,
  },
  dialogConfirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});

export default CourseContentManagerScreen;
