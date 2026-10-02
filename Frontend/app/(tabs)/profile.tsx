import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wordmark } from '@/components/Shared/AppIcon';
import { COURSES } from '@/constants/data';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, purchasedCourses, logout } = useApp();
  const name = user?.name || 'Student';
  const initials = name.split(' ').map((item) => item[0]).join('').slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 94 }]}>
      <View style={styles.brandRow}><Wordmark /><Feather name="settings" size={20} color={colors.inkSubtle} /></View>
      <View style={styles.profileHeader}>
        <View style={[styles.bigAvatar, { backgroundColor: colors.coral }]}><Text style={[styles.initials, { color: colors.primaryForeground }]}>{initials}</Text></View>
        <Text style={[styles.name, { color: colors.navy }]}>{name}</Text>
        <Text style={[styles.email, { color: colors.inkSubtle }]}>{user?.email}</Text>
      </View>
      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.navy }]}>{purchasedCourses.length}</Text><Text style={[styles.statLabel, { color: colors.inkSubtle }]}>Courses</Text></View>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.navy }]}>3</Text><Text style={[styles.statLabel, { color: colors.inkSubtle }]}>Day streak</Text></View>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.statValue, { color: colors.navy }]}>86%</Text><Text style={[styles.statLabel, { color: colors.inkSubtle }]}>Avg. score</Text></View>
      </View>

      <View style={{ marginBottom: 20 }}>
        <Text style={[styles.sectionTitle, { color: colors.navy }]}>Study Material</Text>
        <Pressable
          testID="course-study-material-card"
          onPress={() =>
            router.push({
              pathname: '/course/[id]/content',
              params: { id: '10', title: 'Class 11th PCB' },
            } as any)
          }
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: '#fef3c7' }]}>
            <Feather name="book-open" size={19} color="#d97706" />
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, { color: colors.navy }]}>Course Study Material</Text>
            <Text style={[styles.rowMeta, { color: colors.inkSubtle }]}>Access Lectures, Notes & PDFs</Text>
          </View>
          <Feather name="chevron-right" size={17} color={colors.inkSubtle} />
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.navy }]}>My learning</Text>
      {purchasedCourses.length ? purchasedCourses.map((id) => {
        const course = COURSES.find((item) => item.id === id);
        if (!course) return null;
        return <Pressable key={id} onPress={() => router.push(`/course/${id}`)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.rowIcon, { backgroundColor: colors.mint }]}><Feather name="play-circle" size={19} color={colors.teal} /></View><View style={styles.rowBody}><Text style={[styles.rowTitle, { color: colors.navy }]}>{course.title}</Text><Text style={[styles.rowMeta, { color: colors.inkSubtle }]}>Continue course</Text></View><Feather name="chevron-right" size={17} color={colors.inkSubtle} /></Pressable>;
      }) : (
        <Pressable onPress={() => router.push('/(tabs)/explore')} style={[styles.emptyLearning, { backgroundColor: colors.accent }]}><Feather name="book-open" size={20} color={colors.coral} /><Text style={[styles.emptyTitle, { color: colors.navy }]}>Your learning shelf is empty</Text><Text style={[styles.emptyText, { color: colors.inkSubtle }]}>Explore a course and start building your streak.</Text><Text style={[styles.linkText, { color: colors.coral }]}>Browse courses <Feather name="arrow-right" size={13} color={colors.coral} /></Text></Pressable>
      )}
      <Pressable testID="logout-button" onPress={handleLogout} style={({ pressed }) => [styles.logout, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><Feather name="log-out" size={17} color={colors.destructive} /><Text style={[styles.logoutText, { color: colors.destructive }]}>Log out</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileHeader: { alignItems: 'center', marginTop: 35, marginBottom: 24 },
  bigAvatar: { width: 76, height: 76, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Inter_700Bold', fontSize: 25 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 23, marginTop: 14 },
  email: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  stats: { flexDirection: 'row', gap: 9, marginBottom: 28 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 16, alignItems: 'center', paddingVertical: 14 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 12 },
  row: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rowIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, marginLeft: 11 },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  rowMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  emptyLearning: { borderRadius: 20, padding: 20, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 11 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5, textAlign: 'center' },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 16 },
  logout: { borderWidth: 1, borderRadius: 15, height: 50, marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});