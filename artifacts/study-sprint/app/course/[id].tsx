import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice } from '@/constants/data';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function CourseDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPurchased, purchaseCourse, user } = useApp();
  
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch(`http://localhost:5000/api/courses/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setCourse({
            ...data,
            subtitle: data.category + " Mastery",
            instructor: "Expert Mentor",
            validity: "12 months access",
            lessons: 42,
            students: "2k+ students",
            originalPrice: Math.round(data.price * 1.5),
            tone: 'coral',
            duration: "40 hours"
          });
        }
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [id]);

  const unlocked = course ? isPurchased(course.id.toString()) : false;
  
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'content'>('content');
  const [courseContent, setCourseContent] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  React.useEffect(() => {
    if (unlocked && user?.uid && course) {
      setLoadingContent(true);
      fetch(`http://localhost:5000/api/content/${course.id}?uid=${user.uid}&admin=true`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setCourseContent(data.data);
          }
        })
        .finally(() => setLoadingContent(false));
    }
  }, [unlocked, user?.uid, course]);

  const applyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (code === 'FESTIVE20') {
      setDiscount(Math.round((course?.price || 0) * 0.2));
      setCouponMessage('20% off applied');
    } else if (code === 'STUDY100') {
      setDiscount(100);
      setCouponMessage('₹100 off applied');
    } else {
      setDiscount(0);
      setCouponMessage('That code is not active yet.');
    }
  };

  const buyNow = async () => {
    if (!course) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await purchaseCourse(course.id.toString());
  };

  const openExternal = (url: string) => Linking.openURL(url);

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.navy }}>Loading course details...</Text>
      </View>
    );
  }

  if (!course) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.navy }}>Course not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}><Text style={{ color: colors.coral }}>Go Back</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
        <View style={styles.imageWrap}>
          <Image source={{ uri: course.thumbnail }} style={styles.cover} />
          <View style={styles.imageOverlay} />
          <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card }]}>
            <Feather name="arrow-left" size={20} color={colors.navy} />
          </Pressable>
          <View style={styles.coverMeta}><Text style={[styles.coverCategory, { color: colors.primaryForeground }]}>{course.category.toUpperCase()} · {course.duration}</Text></View>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.navy }]}>{course.title}</Text><Text style={[styles.subtitle, { color: colors.inkSubtle }]}>{course.subtitle}</Text></View>
            {unlocked ? <View style={[styles.unlockedBadge, { backgroundColor: colors.mint }]}><Feather name="unlock" size={13} color={colors.success} /><Text style={[styles.unlockedText, { color: colors.success }]}>Unlocked</Text></View> : null}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}><Feather name="user" size={15} color={colors.coral} /><Text style={[styles.statText, { color: colors.inkSubtle }]}>{course.students}</Text></View>
            <View style={styles.stat}><Feather name="clock" size={15} color={colors.coral} /><Text style={[styles.statText, { color: colors.inkSubtle }]}>{course.validity}</Text></View>
            <View style={styles.stat}><Feather name="layers" size={15} color={colors.coral} /><Text style={[styles.statText, { color: colors.inkSubtle }]}>{course.lessons} lessons</Text></View>
          </View>
          <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>About this course</Text>
            <Text style={[styles.description, { color: colors.inkSubtle }]}>{course.description}</Text>
            <View style={[styles.instructorRow, { borderTopColor: colors.border }]}>
              <View style={[styles.instructorAvatar, { backgroundColor: colors[course.tone] }]}><Text style={[styles.instructorInitial, { color: colors.primaryForeground }]}>{course.instructor[0]}</Text></View>
              <View><Text style={[styles.instructorLabel, { color: colors.inkSubtle }]}>YOUR MENTOR</Text><Text style={[styles.instructorName, { color: colors.navy }]}>{course.instructor}</Text></View>
            </View>
          </View>

          {!unlocked ? (
            <>
              <View style={[styles.couponCard, { backgroundColor: colors.accent }]}>
                <View style={styles.couponHeader}><View><Text style={[styles.cardTitle, { color: colors.navy }]}>Have a coupon?</Text><Text style={[styles.couponHint, { color: colors.inkSubtle }]}>Try FESTIVE20 for 20% off</Text></View><Feather name="tag" size={20} color={colors.coral} /></View>
                <View style={styles.couponInputRow}>
                  <TextInput value={coupon} onChangeText={setCoupon} placeholder="Enter code" placeholderTextColor={colors.inkSubtle} autoCapitalize="characters" style={[styles.couponInput, { color: colors.navy, borderColor: colors.input, backgroundColor: colors.card }]} />
                  <Pressable onPress={applyCoupon} style={[styles.applyButton, { backgroundColor: colors.navy }]}><Text style={[styles.applyText, { color: colors.primaryForeground }]}>Apply</Text></Pressable>
                </View>
                {couponMessage ? <Text style={[styles.couponMessage, { color: couponMessage.includes('applied') ? colors.success : colors.destructive }]}>{couponMessage}</Text> : null}
              </View>
              <View style={styles.checkoutRow}>
                <View><Text style={[styles.totalLabel, { color: colors.inkSubtle }]}>TOTAL TODAY</Text><Text style={[styles.totalPrice, { color: colors.navy }]}>{formatPrice(course.price - discount)} <Text style={[styles.originalPrice, { color: colors.inkSubtle }]}>{formatPrice(course.originalPrice)}</Text></Text></View>
                <Pressable testID="buy-now-button" onPress={buyNow} style={({ pressed }) => [styles.buyButton, { backgroundColor: colors.coral, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.buyText, { color: colors.primaryForeground }]}>Buy now</Text><Feather name="arrow-right" size={17} color={colors.primaryForeground} /></Pressable>
              </View>
              <View style={styles.lockedNote}><Feather name="lock" size={13} color={colors.inkSubtle} /><Text style={[styles.lockedText, { color: colors.inkSubtle }]}>Notes, live classes, replays & tests unlock instantly.</Text></View>
            </>
          ) : (
            <>
              <View style={[styles.unlockedIntro, { backgroundColor: colors.navy, marginTop: 12 }]}>
                <View style={[styles.checkCircle, { backgroundColor: colors.coral }]}><Feather name="check" size={15} color={colors.primaryForeground} /></View>
                <View style={{ flex: 1 }}><Text style={[styles.unlockedIntroTitle, { color: colors.primaryForeground }]}>You’re all set.</Text><Text style={[styles.unlockedIntroText, { color: '#bdc8df' }]}>Access your course materials below.</Text></View>
                <Feather name="star" size={20} color={colors.gold} />
              </View>
              
              <View style={[styles.contentPanel, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
                {loadingContent ? (
                  <Text style={{ color: colors.inkSubtle, padding: 10 }}>Loading content...</Text>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
                      <Pressable onPress={() => setCurrentFolderId(null)}>
                        <Text style={{ color: currentFolderId === null ? colors.navy : colors.coral, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Course Materials</Text>
                      </Pressable>
                      {currentFolderId !== null && (
                        <>
                          <Feather name="chevron-right" size={14} color={colors.inkSubtle} style={{ marginHorizontal: 4 }} />
                          <Text style={{ color: colors.navy, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                            {courseContent.find(c => c.id === currentFolderId)?.title || 'Folder'}
                          </Text>
                        </>
                      )}
                    </View>

                    {courseContent.filter(c => c.parentId === currentFolderId).length === 0 ? (
                      <Text style={{ color: colors.inkSubtle, padding: 10, textAlign: 'center' }}>This folder is empty.</Text>
                    ) : (
                      courseContent.filter(c => c.parentId === currentFolderId).map(item => (
                        <Pressable 
                          key={item.id} 
                          onPress={() => {
                            if (item.type === 'folder') setCurrentFolderId(item.id);
                            else if (item.url) openExternal(item.url);
                          }}
                          style={styles.contentRow}
                        >
                          <View style={[styles.contentIcon, { backgroundColor: item.type === 'folder' ? colors.mint : item.type === 'pdf' ? colors.sky : colors.accent }]}>
                            <Feather name={item.type === 'folder' ? 'folder' : item.type === 'pdf' ? 'file-text' : 'play'} size={18} color={item.type === 'folder' ? colors.teal : item.type === 'pdf' ? colors.lavender : colors.coral} />
                          </View>
                          <View style={styles.contentRowBody}>
                            <Text style={[styles.contentTitle, { color: colors.navy }]}>{item.title}</Text>
                            <Text style={[styles.contentMeta, { color: colors.inkSubtle }]}>{item.type.toUpperCase()}</Text>
                          </View>
                          <Feather name={item.type === 'folder' ? 'chevron-right' : 'external-link'} size={17} color={colors.inkSubtle} />
                        </Pressable>
                      ))
                    )}
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  imageWrap: { height: 245, position: 'relative' },
  cover: { width: '100%', height: '100%' },
  imageOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,33,61,0.18)' },
  backButton: { position: 'absolute', top: 54, left: 19, width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  coverMeta: { position: 'absolute', left: 20, bottom: 18 },
  coverCategory: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  body: { paddingHorizontal: 20, paddingTop: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 33, letterSpacing: -1 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 7 },
  unlockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7, marginLeft: 10 },
  unlockedText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  statsRow: { flexDirection: 'row', gap: 13, marginTop: 18, marginBottom: 20 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  aboutCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 14 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 19, marginTop: 10 },
  instructorRow: { borderTopWidth: 1, marginTop: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  instructorAvatar: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  instructorInitial: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  instructorLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 },
  instructorName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 3 },
  couponCard: { borderRadius: 20, padding: 17, marginBottom: 17 },
  couponHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  couponHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
  couponInputRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  couponInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: 'Inter_500Medium', fontSize: 12 },
  applyButton: { paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  couponMessage: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 8 },
  checkoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  totalPrice: { fontFamily: 'Inter_700Bold', fontSize: 23, marginTop: 4 },
  originalPrice: { fontFamily: 'Inter_400Regular', fontSize: 11, textDecorationLine: 'line-through' },
  buyButton: { borderRadius: 14, paddingHorizontal: 17, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8 },
  buyText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  lockedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 16 },
  lockedText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  unlockedIntro: { borderRadius: 19, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 },
  checkCircle: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  unlockedIntroTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  unlockedIntroText: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  tabs: { gap: 8, paddingBottom: 13 },
  tab: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  contentPanel: { borderWidth: 1, borderRadius: 20, padding: 7 },
  contentRow: { flexDirection: 'row', alignItems: 'center', padding: 10, minHeight: 69, gap: 10 },
  contentRowBody: { flex: 1 },
  contentIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  contentTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 },
  contentMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveBadge: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.4 },
  smallAction: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  smallActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  miniProgressTrack: { height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  miniProgressFill: { height: 4, borderRadius: 2 },
  quizRow: { flexDirection: 'row', alignItems: 'center', padding: 10, minHeight: 80, gap: 10 },
});