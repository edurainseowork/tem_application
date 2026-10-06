import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useApp } from '@/context/AppContext';
import { registerForPushNotifications } from '@/utils/pushNotifications';

/**
 * Registers the device for admin push notifications once a user is signed in, and opens the
 * Notifications screen when the user taps one (including a tap that launched the app).
 */
export function PushNotificationsManager() {
  const { user } = useApp();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    registerForPushNotifications().catch((e) => console.warn('Push registration failed:', e?.message ?? e));
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handledResponseId.current === id) return;
    handledResponseId.current = id;
    router.push('/notifications');
  }, [lastResponse, user?.uid]);

  return null;
}
