import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { CATEGORIES, COURSES } from '@/constants/data';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, purchasedCourses } = useApp();
  const firstName = user?.name.split(' ')[0] || 'Learner';
  const featured = COURSES[0];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 34, paddingBottom: insets.bottom + 92 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.inkSubtle }]}>SUNDAY, 27 SEPTEMBER</Text>
          <Text style={[styles.greeting, { color: colors.navy }]}>Hello, {firstName}</Text>
        </View>
        <Pressable style={[styles.avatar, { backgroundColor: colors.navy }]} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{firstName.slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.navy }]}>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroKicker, { color: colors.gold }]}>KEEP THE STREAK ALIVE</Text>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>One focused session at a time.</Text>
          <Text style={[styles.heroText, { color: '#bdc8df' }]}>You are closer than you think.</Text>
          <Pressable style={[styles.heroButton, { backgroundColor: colors.coral }]} onPress={() => router.push(`/course/${featured.id}`)}>
            <Text style={[styles.heroButtonText, { color: colors.primaryForeground }]}>Resume learning</Text>
            <Feather name="arrow-up-right" size={16} color={colors.primaryForeground} />
          </Pressable>
        </View>
        <View style={[styles.heroOrb, { backgroundColor: colors.coral }]}>
          <AppIcon />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.navy }]}>Explore your path</Text>
        <Pressable onPress={() => router.push('/(tabs)/explore')}>
          <Text style={[styles.seeAll, { color: colors.coral }]}>See all</Text>
        </Pressable>
      </View>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => router.push({ pathname: '/(tabs)/explore', params: { category: category.id } })}
            style={({ pressed }) => [
              styles.categoryCard,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.84 : 1 },
            ]}
          >
            <View style={[styles.categoryIcon, { backgroundColor: colors[category.tone] }]}>
              <Feather name={category.icon} size={19} color={colors.primaryForeground} />
            </View>
            <Text style={[styles.categoryLabel, { color: colors.navy }]}>{category.label}</Text>
            <Feather name="arrow-up-right" size={15} color={colors.inkSubtle} />
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.navy }]}>Continue learning</Text>
        <Text style={[styles.progressLabel, { color: colors.inkSubtle }]}>{purchasedCourses.length ? '1 of 4 active' : 'Start today'}</Text>
      </View>
      <Pressable style={[styles.coursePreview, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push(`/course/${featured.id}`)}>
        <Image source={featured.image} style={styles.courseImage} />
        <View style={styles.courseInfo}>
          <View style={[styles.miniPill, { backgroundColor: colors.accent }]}>
            <Text style={[styles.miniPillText, { color: colors.coral }]}>JEE · PHYSICS</Text>
          </View>
          <Text style={[styles.courseTitle, { color: colors.navy }]} numberOfLines={2}>{featured.title}</Text>
          <Text style={[styles.courseMeta, { color: colors.inkSubtle }]}>{featured.lessons} lessons · {featured.duration}</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.coral, width: purchasedCourses.includes(featured.id) ? '38%' : '0%' }]} />
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.navy }]}>Next live class</Text>
        <Feather name="calendar" size={18} color={colors.inkSubtle} />
      </View>
      <View style={[styles.liveCard, { backgroundColor: colors.mint }]}>
        <View style={[styles.liveDot, { backgroundColor: colors.teal }]} />
        <View style={styles.liveCopy}>
          <Text style={[styles.liveLabel, { color: colors.teal }]}>UP NEXT · TUE, 7:00 PM</Text>
          <Text style={[styles.liveTitle, { color: colors.navy }]}>Ask me anything: Mechanics</Text>
          <Text style={[styles.liveMeta, { color: colors.inkSubtle }]}>with Arjun Mehta</Text>
        </View>
        <Pressable style={[styles.joinButton, { backgroundColor: colors.navy }]} onPress={() => router.push(`/course/${featured.id}`)}>
          <Text style={[styles.joinText, { color: colors.primaryForeground }]}>View</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.1, marginBottom: 7 },
  greeting: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.8 },
  avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  heroCard: { minHeight: 200, borderRadius: 26, padding: 21, flexDirection: 'row', overflow: 'hidden', marginBottom: 28 },
  heroCopy: { flex: 1, zIndex: 1 },
  heroKicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, marginBottom: 12 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, lineHeight: 29, letterSpacing: -0.7, maxWidth: 220 },
  heroText: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 9 },
  heroButton: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  heroButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  heroOrb: { width: 96, height: 96, borderRadius: 48, position: 'absolute', right: -18, bottom: -17, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: -0.3 },
  seeAll: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  progressLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 27 },
  categoryCard: { width: '48.4%', minHeight: 108, borderRadius: 19, borderWidth: 1, padding: 13, justifyContent: 'space-between' },
  categoryIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  categoryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 11 },
  coursePreview: { borderRadius: 20, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 27 },
  courseImage: { width: 92, height: 104, borderRadius: 14 },
  courseInfo: { flex: 1 },
  miniPill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  miniPillText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5 },
  courseTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, lineHeight: 19, marginTop: 8 },
  courseMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
  progressTrack: { height: 5, borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  liveCard: { borderRadius: 19, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  liveDot: { width: 10, height: 10, borderRadius: 5, alignSelf: 'flex-start', marginTop: 4 },
  liveCopy: { flex: 1, marginLeft: 12 },
  liveLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 },
  liveTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 6 },
  liveMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  joinButton: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  joinText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
});
