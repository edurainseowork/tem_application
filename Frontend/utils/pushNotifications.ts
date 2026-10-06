import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from '@/api/adminNotifications';

// Show admin notifications as banners even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for notification permission, gets this device's Expo push token and saves it for the
 * signed-in user. Returns the token, or null when push is unavailable (web, simulator,
 * permission denied, or no EAS projectId configured yet).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  if (Platform.OS === 'android') {
    // Must match the channelId the backend sends with (lib/expoPush.ts)
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push notifications disabled: no EAS projectId in app.json (run `eas init`).');
    return null;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  return token;
}
