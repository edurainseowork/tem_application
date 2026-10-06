import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchNotifications, markAllNotificationsRead, type AppNotification } from '@/api/liveClasses';
import { fetchAdminNotifications, getLastSeenAdminNotificationId, setLastSeenAdminNotificationId, type AdminNotification } from '@/api/adminNotifications';
import { LiveClassCard } from '@/components/LiveClass/LiveClassCard';
import { useColors } from '@/hooks/useColors';
import { useNow } from '@/hooks/useNow';

// Live class notifications and admin notifications come from separate APIs and are shown together
type FeedItem =
  | { kind: 'live'; createdAt: string; notification: AppNotification }
  | { kind: 'admin'; createdAt: string; notification: AdminNotification };

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [lastSeenAdminId, setLastSeenAdminId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      // Load both independently, so one failing does not hide the other
      const [live, admin, seen] = await Promise.allSettled([fetchNotifications(), fetchAdminNotifications(), getLastSeenAdminNotificationId()]);
      if (live.status === 'rejected' && admin.status === 'rejected') throw live.reason;
      const liveItems = live.status === 'fulfilled' ? live.value : [];
      const adminItems = admin.status === 'fulfilled' ? admin.value : [];

      setFeed([
        ...liveItems.map((notification): FeedItem => ({ kind: 'live', createdAt: notification.createdAt, notification })),
        ...adminItems.map((notification): FeedItem => ({ kind: 'admin', createdAt: notification.createdAt, notification })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setError('');

      // Opening the inbox marks everything as read; this render still highlights what was new
      if (liveItems.some((notification) => !notification.isRead)) {
        markAllNotificationsRead().catch((e) => console.warn('Mark read error:', e.message));
      }
      const lastSeen = seen.status === 'fulfilled' ? seen.value : 0;
      setLastSeenAdminId(lastSeen);
      if (adminItems[0] && adminItems[0].id > lastSeen) await setLastSeenAdminNotificationId(adminItems[0].id);
    } catch (e: any) {
      setError(e.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="arrow-left" size={20} color={colors.navy} />
        </Pressable>
        <Text style={[styles.title, { color: colors.navy }]}>Notifications</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.coral} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={[styles.emptyText, { color: colors.inkSubtle }]}>Loading notifications...</Text>
        ) : error ? (
          <Text style={[styles.emptyText, { color: colors.destructive }]}>{error}</Text>
        ) : feed.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.accent }]}>
            <Feather name="bell" size={22} color={colors.coral} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>You’re all caught up</Text>
            <Text style={[styles.emptyText, { color: colors.inkSubtle }]}>Announcements and live classes for your courses will show up here.</Text>
          </View>
        ) : (
          feed.map((item) => {
            if (item.kind === 'admin') {
              const notification = item.notification;
              const isNew = notification.id > lastSeenAdminId;
              return (
                <View key={`admin-${notification.id}`} style={[styles.plainCard, { backgroundColor: colors.card, borderColor: isNew ? colors.coral : colors.border }]}>
                  {notification.imageUrl ? (
                    <Image source={{ uri: notification.imageUrl }} style={styles.announcementImage} resizeMode="cover" />
                  ) : null}
                  <View style={styles.announcementHeader}>
                    <View style={[styles.announcementIcon, { backgroundColor: colors.accent }]}>
                      <Feather name="volume-2" size={15} color={colors.coral} />
                    </View>
                    <Text style={[styles.announcementTime, { color: colors.inkSubtle }]}>{isNew ? 'NEW · ' : ''}{formatSentAt(notification.createdAt)}</Text>
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.navy, marginTop: 8 }]}>{notification.title}</Text>
                  <Text style={[styles.emptyText, { color: colors.inkSubtle, textAlign: 'left' }]}>{notification.body}</Text>
                </View>
              );
            }

            const notification = item.notification;
            return notification.liveClass ? (
              <Pressable key={`live-${notification.id}`} onPress={() => router.push(`/course/${notification.liveClass!.courseId}`)}>
                <LiveClassCard
                  liveClass={notification.liveClass}
                  now={now}
                  eyebrow={notification.title.toUpperCase()}
                  subtitle={notification.liveClass.courseTitle}
                  highlighted={!notification.isRead}
                />
              </Pressable>
            ) : (
              <View key={`live-${notification.id}`} style={[styles.plainCard, { backgroundColor: colors.card, borderColor: notification.isRead ? colors.border : colors.coral }]}>
                <Text style={[styles.emptyTitle, { color: colors.navy, marginTop: 0 }]}>{notification.title}</Text>
                <Text style={[styles.emptyText, { color: colors.inkSubtle, textAlign: 'left' }]}>{notification.body}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
  backButton: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: -0.5 },
  empty: { borderRadius: 20, padding: 22, alignItems: 'center', marginTop: 12 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 10 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  plainCard: { borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 12 },
  announcementImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, marginBottom: 12 },
  announcementHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  announcementIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  announcementTime: { fontFamily: 'Inter_500Medium', fontSize: 10 },
});

// e.g. "Today, 7:05 PM" or "3 Oct, 7:05 PM"
const formatSentAt = (value: string) => {
  const date = new Date(value);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString()
    ? `Today, ${time}`
    : `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
};
