import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebaseConfig';
import { API_BASE_URL } from './client';

// Admin notifications sent from the CMS (separate from live class notifications in liveClasses.ts)
export interface AdminNotification {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
}

const authHeaders = async () => {
   // After a page reload Firebase restores the saved login asynchronously; wait for it
   await auth.authStateReady();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Not signed in');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` };
};

export const fetchAdminNotifications = async (): Promise<AdminNotification[]> => {
  const res = await fetch(`${API_BASE_URL}/api/admin-notifications`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Failed to load notifications (${res.status})`);
  return data.data;
};

// Tells the backend which device to push admin notifications to
export const registerPushToken = async (token: string, platform: 'android' | 'ios') => {
  const res = await fetch(`${API_BASE_URL}/api/admin-notifications/push-token`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to register for notifications (${res.status})`);
  }
};

// The newest notification id the user has opened, kept on the device to show the "new" dot
const LAST_SEEN_KEY = 'admin-notifications-last-seen';

export const getLastSeenAdminNotificationId = async () => Number(await AsyncStorage.getItem(LAST_SEEN_KEY)) || 0;

export const setLastSeenAdminNotificationId = (id: number) => AsyncStorage.setItem(LAST_SEEN_KEY, String(id));
