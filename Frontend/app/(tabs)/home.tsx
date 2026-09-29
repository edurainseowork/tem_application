import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES } from '@/constants/data';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const firstName = user?.name?.split(' ')[0] || 'Learner';
  
  const [banners, setBanners] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch('http://localhost:5000/api/banners')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setBanners(data.data);
        }
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.navy }}>Loading...</Text>
      </View>
    );
  }

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

      {/* Banner Carousel */}
      {banners.length > 0 && (
        <View style={{ marginBottom: 28, height: 160 }}>
          <ScrollView 
            horizontal 
            pagingEnabled 
            showsHorizontalScrollIndicator={false}
            style={{ borderRadius: 16, overflow: 'hidden' }}
          >
            {banners.map((banner) => (
              <Image 
                key={banner.id} 
                source={{ uri: banner.imageUrl }} 
                style={{ width: width - 40, height: 160, resizeMode: 'cover' }} 
              />
            ))}
          </ScrollView>
        </View>
      )}

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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: -0.3 },
  seeAll: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 27 },
  categoryCard: { width: '48.4%', minHeight: 108, borderRadius: 19, borderWidth: 1, padding: 13, justifyContent: 'space-between' },
  categoryIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  categoryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 11 },
});