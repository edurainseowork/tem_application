import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchNotifications, markAllNotificationsRead, type AppNotification } from '@/api/liveClasses';
import { LiveClassCard } from '@/components/LiveClass/LiveClassCard';
import { useColors } from '@/hooks/useColors';
import { useNow } from '@/hooks/useNow';

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data);
      setError('');
      // Opening the inbox marks everything as read; this render still highlights what was new
      if (data.some((notification) => !notification.isRead)) {
        markAllNotificationsRead().catch((e) => console.warn('Mark read error:', e.message));
      }
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
        ) : notifications.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.accent }]}>
            <Feather name="bell" size={22} color={colors.coral} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>You’re all caught up</Text>
            <Text style={[styles.emptyText, { color: colors.inkSubtle }]}>Live classes scheduled for your courses will show up here.</Text>
          </View>
        ) : (
          notifications.map((notification) =>
            notification.liveClass ? (
              <Pressable key={notification.id} onPress={() => router.push(`/course/${notification.liveClass!.courseId}`)}>
                <LiveClassCard
                  liveClass={notification.liveClass}
                  now={now}
                  eyebrow={notification.title.toUpperCase()}
                  subtitle={notification.liveClass.courseTitle}
                  highlighted={!notification.isRead}
                />
              </Pressable>
            ) : (
              <View key={notification.id} style={[styles.plainCard, { backgroundColor: colors.card, borderColor: notification.isRead ? colors.border : colors.coral }]}>
                <Text style={[styles.emptyTitle, { color: colors.navy, marginTop: 0 }]}>{notification.title}</Text>
                <Text style={[styles.emptyText, { color: colors.inkSubtle, textAlign: 'left' }]}>{notification.body}</Text>
              </View>
            ),
          )
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
});
