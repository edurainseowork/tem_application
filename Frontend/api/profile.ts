import { Platform } from 'react-native';
import { auth } from '../firebaseConfig';
import { API_BASE_URL } from './client';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export interface ProfileCourse {
  id: number;
  title: string;
  thumbnail: string | null;
  category: string;
  purchasedAt: string;
}

export interface StudentProfile {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  gender: Gender | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  profilePhoto: string | null;
  memberSince: string;
  streak: { current: number; longest: number; lastActiveAt: string | null };
  courses: ProfileCourse[];
}

export type ProfileUpdate = Partial<{
  name: string;
  phone: string | null;
  gender: Gender | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}>;

const authToken = async () => {
  // After an app restart Firebase restores the saved login asynchronously; wait for it
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in again');
  return token;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await authToken();
  const res = await fetch(`${API_BASE_URL}/api/profile${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = Array.isArray(data.issues) && data.issues[0]?.message;
    throw new Error(issue || data.error || `Request failed (${res.status})`);
  }
  return data.data as T;
};

export const fetchProfile = () => request<StudentProfile>('');

export const updateProfile = (update: ProfileUpdate) =>
  request<StudentProfile>('', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });

/** Records that the student opened the app today; returns the updated streak. */
export const recordStreakActivity = () =>
  request<StudentProfile['streak']>('/activity', { method: 'POST' });

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodes base64 into bytes (no dependency on atob/Buffer being available). */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64_CHARS.indexOf(clean[i]);
    const b = BASE64_CHARS.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? BASE64_CHARS.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? BASE64_CHARS.indexOf(clean[i + 3]) : -1;
    bytes[byteIndex++] = (a << 2) | (b >> 4);
    if (c >= 0) bytes[byteIndex++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) bytes[byteIndex++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, byteIndex);
}

/**
 * Uploads the profile photo as raw image bytes. Expo's fetch (SDK 52+) cannot send React Native's
 * { uri, name, type } FormData parts, so the image is sent as the request body instead.
 * Pass the base64 data from expo-image-manipulator / expo-image-picker, or a URI on web.
 */
export const uploadProfilePhoto = async (image: { base64?: string | null; uri: string }) => {
  let body: Uint8Array;
  if (image.base64) {
    body = base64ToBytes(image.base64);
  } else if (Platform.OS === 'web') {
    body = new Uint8Array(await (await fetch(image.uri)).arrayBuffer());
  } else {
    throw new Error('Could not read the selected photo. Please try another one.');
  }
  return request<StudentProfile>('/photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: body as unknown as BodyInit,
  });
};

export const removeProfilePhoto = () => request<StudentProfile>('/photo', { method: 'DELETE' });