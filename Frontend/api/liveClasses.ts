import { auth } from '../firebaseConfig';
import { API_BASE_URL } from './client';

export type LiveClassStatus = 'live' | 'upcoming' | 'ended';

export interface LiveClass {
  id: number;
  courseId: number;
  title: string;
  startTime: string;
  endTime: string;
  meetUrl: string;
  status: LiveClassStatus;
  courseTitle?: string | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  liveClass: LiveClass | null;
  // Set for type 'test' while the test is still visible to students
  test: {
    id: number;
    courseId: number;
    courseTitle: string | null;
    title: string;
    publishTime: string;
    closeTime: string | null;
    durationMinutes: number;
    status: 'SCHEDULED' | 'PUBLISHED' | 'COMPLETED';
  } | null;
}

// Students can join from this many minutes before the scheduled start
export const JOIN_EARLY_MINUTES = 10;

const authFetch = async (path: string, init: RequestInit = {}) => {
  // After a page reload Firebase restores the saved login asynchronously; wait for it
  await auth.authStateReady()
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

export const fetchCourseLiveClasses = async (courseId: number | string): Promise<LiveClass[]> =>
  (await authFetch(`/courses/${courseId}/live-classes`)).data;

export const fetchNotifications = async (): Promise<AppNotification[]> =>
  (await authFetch('/notifications')).data;

export const markAllNotificationsRead = async () => {
  await authFetch('/notifications/read-all', { method: 'POST' });
};

// Recomputed on the device so a screen left open flips from upcoming to live without refetching
export const getLiveClassStatus = (liveClass: Pick<LiveClass, 'startTime' | 'endTime'>, now: number = Date.now()): LiveClassStatus => {
  if (now >= new Date(liveClass.endTime).getTime()) return 'ended';
  if (now >= new Date(liveClass.startTime).getTime()) return 'live';
  return 'upcoming';
};

export const canJoinLiveClass = (liveClass: Pick<LiveClass, 'startTime' | 'endTime'>, now: number = Date.now()) =>
  getLiveClassStatus(liveClass, now) !== 'ended' &&
  now >= new Date(liveClass.startTime).getTime() - JOIN_EARLY_MINUTES * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// e.g. "Today, 7:00 PM – 8:00 PM" or "Sat, 4 Oct, 7:00 PM – 8:00 PM"
export const formatLiveClassWindow = (startTime: string, endTime: string, now: Date = new Date()) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const time = (date: Date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayDiff = Math.round((startOfDay(start) - startOfDay(now)) / 86400000);
  const day = dayDiff === 0
    ? 'Today'
    : dayDiff === 1
      ? 'Tomorrow'
      : start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${time(start)} – ${time(end)}`;
};