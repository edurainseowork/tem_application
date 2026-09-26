import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COURSES, formatPrice, getCourse, LIVE_CLASSES, NOTES, RECORDINGS } from '@/constants/data';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type ContentTab = 'notes' | 'live' | 'replays' | 'tests';

export default function CourseDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = getCourse(id);
  const { isPurchased, purchaseCourse } = useApp();
  const unlocked = isPurchased(course.id);
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [activeTab, setActiveTab] = useState<ContentTab>('notes');
  const tabs = useMemo(() => [
    { id: 'notes' as const, label: 'Notes', icon: 'file-text' as const },
    { id: 'live' as const, label: 'Live', icon: 'radio' as const },
    { id: 'replays' as const, label: 'Replays', icon: 'play-circle' as const },
    { id: 'tests' as const, label: 'Tests', icon: 'check-circle' as const },
  ], []);

  const applyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (code === 'FESTIVE20') {
      setDiscount(Math.round(course.price * 0.2));
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
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await purchaseCourse(course.id);
  };

  const openExternal = (url: string) => Linking.openURL(url);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
        <View style={styles.imageWrap}>
          <Image source={course.image} style={styles.cover} />
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
          {!unlocked ? (
            <>
              <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.navy }]}>About this course</Text>
                <Text style={[styles.description, { color: colors.inkSubtle }]}>{course.description}</Text>
                <View style={[styles.instructorRow, { borderTopColor: colors.border }]}>
                  <View style={[styles.instructorAvatar, { backgroundColor: colors[course.tone] }]}><Text style={[styles.instructorInitial, { color: colors.primaryForeground }]}>{course.instructor[0]}</Text></View>
                  <View><Text style={[styles.instructorLabel, { color: colors.inkSubtle }]}>YOUR MENTOR</Text><Text style={[styles.instructorName, { color: colors.navy }]}>{course.instructor}</Text></View>
                </View>
              </View>
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
              <View style={[styles.unlockedIntro, { backgroundColor: colors.navy }]}>
                <View style={[styles.checkCircle, { backgroundColor: colors.coral }]}><Feather name="check" size={15} color={colors.primaryForeground} /></View>
                <View style={{ flex: 1 }}><Text style={[styles.unlockedIntroTitle, { color: colors.primaryForeground }]}>You’re all set.</Text><Text style={[styles.unlockedIntroText, { color: '#bdc8df' }]}>Your next lesson is waiting.</Text></View>
                <Feather name="star" size={20} color={colors.gold} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {tabs.map((tab) => <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tab, { borderColor: activeTab === tab.id ? colors.coral : colors.border, backgroundColor: activeTab === tab.id ? colors.accent : colors.card }]}><Feather name={tab.icon} size={15} color={activeTab === tab.id ? colors.coral : colors.inkSubtle} /><Text style={[styles.tabText, { color: activeTab === tab.id ? colors.coral : colors.inkSubtle }]}>{tab.label}</Text></Pressable>)}
              </ScrollView>
              <View style={[styles.contentPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {activeTab === 'notes' ? NOTES.map((note) => <Pressable key={note.id} onPress={() => openExternal('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf')} style={styles.contentRow}><View style={[styles.contentIcon, { backgroundColor: colors.sky }]}><Feather name={note.icon} size={18} color={colors.lavender} /></View><View style={styles.contentRowBody}><Text style={[styles.contentTitle, { color: colors.navy }]}>{note.title}</Text><Text style={[styles.contentMeta, { color: colors.inkSubtle }]}>{note.meta}</Text></View><Feather name="download" size={17} color={colors.inkSubtle} /></Pressable>) : null}
                {activeTab === 'live' ? LIVE_CLASSES.map((session) => <View key={session.id} style={styles.contentRow}><View style={[styles.contentIcon, { backgroundColor: colors.mint }]}><Feather name="radio" size={18} color={colors.teal} /></View><View style={styles.contentRowBody}><View style={styles.sessionTitleRow}><Text style={[styles.contentTitle, { color: colors.navy }]}>{session.title}</Text>{session.live ? <Text style={[styles.liveBadge, { color: colors.teal }]}>LIVE SOON</Text> : null}</View><Text style={[styles.contentMeta, { color: colors.inkSubtle }]}>{session.date} · {session.mentor}</Text></View><Pressable onPress={() => openExternal('https://www.youtube.com/live')} style={[styles.smallAction, { backgroundColor: colors.navy }]}><Text style={[styles.smallActionText, { color: colors.primaryForeground }]}>Join</Text></Pressable></View>) : null}
                {activeTab === 'replays' ? RECORDINGS.map((recording) => <Pressable key={recording.id} onPress={() => openExternal('https://vimeo.com')} style={styles.contentRow}><View style={[styles.contentIcon, { backgroundColor: colors.accent }]}><Feather name="play" size={18} color={colors.coral} /></View><View style={styles.contentRowBody}><Text style={[styles.contentTitle, { color: colors.navy }]}>{recording.title}</Text><Text style={[styles.contentMeta, { color: colors.inkSubtle }]}>{recording.meta}</Text>{recording.progress ? <View style={[styles.miniProgressTrack, { backgroundColor: colors.secondary }]}><View style={[styles.miniProgressFill, { backgroundColor: colors.coral, width: `${recording.progress}%` }]} /></View> : null}</View><Feather name="play-circle" size={18} color={colors.coral} /></Pressable>) : null}
                {activeTab === 'tests' ? <Pressable onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: course.id } })} style={styles.quizRow}><View style={[styles.contentIcon, { backgroundColor: colors.mint }]}><Feather name="check-circle" size={18} color={colors.success} /></View><View style={styles.contentRowBody}><Text style={[styles.contentTitle, { color: colors.navy }]}>Weekly Physics Check-in</Text><Text style={[styles.contentMeta, { color: colors.inkSubtle }]}>3 questions · 5 min</Text></View><Feather name="arrow-right" size={18} color={colors.inkSubtle} /></Pressable> : null}
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