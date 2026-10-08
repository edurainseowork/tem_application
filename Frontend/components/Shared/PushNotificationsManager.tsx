import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApp } from '@/context/AppContext';

// Expo Go (SDK 53+) dropped Android push support and expo-notifications throws as soon as it is
// loaded there. This component sits in the root _layout, so a static import would take down the
// whole app in Expo Go. Push therefore only runs in a development/production build, and the
// library is loaded lazily with require() so Expo Go never evaluates it.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type NotificationsModule = typeof import('expo-notifications');

function loadNotifications(): NotificationsModule | null {
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch (e: any) {
    console.warn('Push notifications unavailable:', e?.message ?? e);
    return null;
  }
}

/**
 * Registers the device for push notifications once a user is signed in, and opens the
 * Notifications screen (or the test, for test notifications) when the user taps one,
 * including a tap that launched the app.
 */
export function PushNotificationsManager() {
  const { user } = useApp();
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!user || Platform.OS === 'web' || isExpoGo) return;

    const Notifications = loadNotifications();
    if (!Notifications) return;

    const { registerForPushNotifications } = require('@/utils/pushNotifications') as typeof import('@/utils/pushNotifications');
    registerForPushNotifications().catch((e) => console.warn('Push registration failed:', e?.message ?? e));

    const openNotifications = (response: { notification: { request: { identifier: string; content: { data?: Record<string, unknown> } } } } | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledResponseId.current === id) return;
      handledResponseId.current = id;
      // Test notifications open the test itself; everything else opens the Notifications screen
      const data = response.notification.request.content.data ?? {};
      if (data.type === 'test' && data.testId) router.push({ pathname: '/test/[id]', params: { id: String(data.testId) } });
      else router.push('/notifications');
    };

    // A tap that launched the app, then any later taps while it runs
    Notifications.getLastNotificationResponseAsync()
      .then(openNotifications)
      .catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotifications);

    return () => subscription.remove();
  }, [user?.uid]);

  return null;
}