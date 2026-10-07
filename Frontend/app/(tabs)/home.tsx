import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES, type Category as CategoryStyle } from '@/constants/data';
import { fetchNotifications } from '@/api/liveClasses';
import { fetchAdminNotifications, getLastSeenAdminNotificationId } from '@/api/adminNotifications';
import { API_BASE_URL, fetchCategories } from '@/api/client';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import BannerCarousel from '@/components/Home/BannerCarousel';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const firstName = user?.name?.split(' ')[0] || 'Learner';
  
  const formattedDate = React.useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).toUpperCase();
  }, []);
  
  const [banners, setBanners] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  // Category cards come from the CMS; icons/tones cycle through the built-in styles.
  const [categoryCards, setCategoryCards] = React.useState<{ id: string; label: string; icon: CategoryStyle['icon']; tone: CategoryStyle['tone'] }[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
    // Falls back to the initial if the photo cannot be loaded; retried when the photo changes
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  React.useEffect(() => setAvatarFailed(false), [user?.photo]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user) return;
      const loadUnread = () => {
        // Badge = unread live class notifications + admin notifications newer than the last one seen
        Promise.allSettled([fetchNotifications(), fetchAdminNotifications(), getLastSeenAdminNotificationId()])
          .then(([live, admin, seen]) => {
            const liveUnread = live.status === 'fulfilled' ? live.value.filter((notification) => !notification.isRead).length : 0;
            const lastSeen = seen.status === 'fulfilled' ? seen.value : 0;
            const adminNew = admin.status === 'fulfilled' ? admin.value.filter((notification) => notification.id > lastSeen).length : 0;
            setUnreadCount(liveUnread + adminNew);
            if (live.status === 'rejected') console.warn('Notifications fetch error:', live.reason?.message);
          });
      };
      loadUnread();
      const interval = setInterval(loadUnread, 5000);
      return () => clearInterval(interval);
    }, [user]),
  );

  React.useEffect(() => {
    const palette = CATEGORIES.filter((c) => c.id !== 'all');
    const all = CATEGORIES.find((c) => c.id === 'all')!;
    fetchCategories().then((data) => {
      setCategoryCards([
        ...data.map((c, i) => ({ id: c.slug, label: c.name, icon: palette[i % palette.length].icon, tone: palette[i % palette.length].tone })),
        { id: 'all', label: all.label, icon: all.icon, tone: all.tone },
      ]);
    });
  }, []);

  React.useEffect(() => {
    fetch(`${API_BASE_URL}/api/banners`)
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
          <Text style={[styles.eyebrow, { color: colors.inkSubtle }]}>{formattedDate}</Text>
          <Text style={[styles.greeting, { color: colors.navy }]}>Hello, {firstName}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable testID="notifications-bell" style={[styles.bell, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push('/notifications')}>
            <Feather name="bell" size={19} color={colors.navy} />
            {unreadCount > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: colors.coral, borderColor: colors.background }]}>
                <Text style={[styles.bellBadgeText, { color: colors.primaryForeground }]}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
                    <Pressable style={[styles.avatar, { backgroundColor: colors.navy }]} onPress={() => router.push('/(tabs)/profile')}>
            {user?.photo && !avatarFailed ? (
              <Image source={{ uri: user.photo }} style={styles.avatarImage} onError={() => setAvatarFailed(true)} />
            ) : (
              <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{firstName.slice(0, 1).toUpperCase()}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Banner Carousel */}
      <BannerCarousel banners={banners} />

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.navy }]}>Explore your path</Text>
        <Pressable onPress={() => router.push('/(tabs)/explore')}>
          <Text style={[styles.seeAll, { color: colors.coral }]}>See all</Text>
        </Pressable>
      </View>
      <View style={styles.categoryGrid}>
        {categoryCards.map((category) => (
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bell: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  bellBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
    avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 42, height: 42 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: -0.3 },
  seeAll: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 27 },
  categoryCard: { width: '48.4%', minHeight: 108, borderRadius: 19, borderWidth: 1, padding: 13, justifyContent: 'space-between' },
  categoryIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  categoryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 11 },
});