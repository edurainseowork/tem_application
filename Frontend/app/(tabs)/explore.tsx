import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice } from '@/constants/data';
import { useColors } from '@/hooks/useColors';
import { fetchCategories, fetchCourses, Course, Category } from '@/api/client';

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string }>();
  // 'all' or a category slug managed from the CMS
  const [category, setCategory] = useState<string>(params.category || 'all');
  const [query, setQuery] = useState('');
  
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    Promise.all([fetchCourses(), fetchCategories()]).then(([courseData, categoryData]) => {
      setAllCourses(courseData);
      setCategories(categoryData);
      setLoading(false);
    });
  }, []);

  React.useEffect(() => {
    if (params.category) setCategory(params.category);
  }, [params.category]);

  const pills = useMemo(
    () => [{ id: 'all', shortLabel: 'All' }, ...categories.map((c) => ({ id: c.slug, shortLabel: c.name }))],
    [categories],
  );

  const courses = useMemo(
    () => allCourses.filter((course) => (category === 'all' || course.categorySlug === category) && `${course.title} ${course.description}`.toLowerCase().includes(query.toLowerCase())),
    [category, query, allCourses],
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 94 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.eyebrow, { color: colors.coral }]}>LEARN YOUR WAY</Text>
      <Text style={[styles.title, { color: colors.navy }]}>Explore courses</Text>
      <Text style={[styles.subtitle, { color: colors.inkSubtle }]}>Shortlist a path. Build a habit. Make progress visible.</Text>
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.inkSubtle} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search courses"
          placeholderTextColor={colors.inkSubtle}
          style={[styles.searchInput, { color: colors.navy }]}
        />
        {query ? <Pressable onPress={() => setQuery('')}><Feather name="x-circle" size={17} color={colors.inkSubtle} /></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {pills.map((item) => {
          const active = item.id === category;
          return (
            <Pressable key={item.id} onPress={() => setCategory(item.id)} style={[styles.pill, { backgroundColor: active ? colors.navy : colors.card, borderColor: active ? colors.navy : colors.border }]}>
              <Text style={[styles.pillText, { color: active ? colors.primaryForeground : colors.inkSubtle }]}>{item.shortLabel}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.resultHeader}>
        <Text style={[styles.resultCount, { color: colors.navy }]}>{loading ? 'Loading…' : `${courses.length} courses`}</Text>
        <Text style={[styles.sortText, { color: colors.inkSubtle }]}>Curated for you</Text>
      </View>
      {loading ? null : courses.length ? courses.map((course) => (
        <Pressable
          key={course.id}
          onPress={() => router.push(`/course/${course.id}`)}
          style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.86 : 1 }]}
        >
          <Image source={{ uri: course.thumbnail }} style={styles.image} />
          <View style={styles.cardBody}>
            <View style={[styles.badge, { backgroundColor: colors.coral }]}>
              <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{course.category?.toUpperCase() || 'COURSE'}</Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>{course.title}</Text>
            <Text style={[styles.cardSubtitle, { color: colors.inkSubtle }]} numberOfLines={1}>{course.description}</Text>
            <View style={styles.cardBottom}>
              <Text style={[styles.price, { color: colors.navy }]}>{formatPrice(course.price / 100)}</Text>
              {course.originalPrice && course.originalPrice > course.price ? (
                <Text style={[styles.lessons, { color: colors.inkSubtle, textDecorationLine: 'line-through' }]}>{formatPrice(course.originalPrice / 100)}</Text>
              ) : null}
            </View>
          </View>
          <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
        </Pressable>
      )) : (
        <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={28} color={colors.inkSubtle} />
          <Text style={[styles.emptyTitle, { color: colors.navy }]}>No courses found</Text>
          <Text style={[styles.emptyText, { color: colors.inkSubtle }]}>Try another keyword or explore a different path.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1.1, marginTop: 7 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 9, maxWidth: 320 },
  search: { height: 52, borderWidth: 1, borderRadius: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  searchInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14 },
  pills: { gap: 8, paddingVertical: 18 },
  pill: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  resultCount: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  sortText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  card: { borderWidth: 1, borderRadius: 20, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  image: { width: 96, height: 116, borderRadius: 14 },
  cardBody: { flex: 1 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.7 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, lineHeight: 20, marginTop: 9 },
  cardSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  price: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  lessons: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  empty: { alignItems: 'center', borderWidth: 1, borderRadius: 20, padding: 28, marginTop: 10 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 6, maxWidth: 230, lineHeight: 18 },
});