import Constants from 'expo-constants';
import { auth } from '../firebaseConfig';

// HTTP Client for communicating with the backend API
export let API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

if (__DEV__ && Constants.expoConfig?.hostUri) {
  const host = Constants.expoConfig.hostUri.split(':')[0];
  if (host) {
    API_BASE_URL = `http://${host}:5000`;
  }
}
console.log("DEBUG: API_BASE_URL is resolved to ->", API_BASE_URL);

export interface Course {
  id: number;
  title: string;
  description: string;
  price: number; // paise
  originalPrice: number | null; // paise, MRP shown struck-through
  thumbnail: string; // absolute URL
  category: string; // category name
  categoryId: number | null;
  categorySlug: string | null;
    mentorName: string | null;
  mentorExperience: string | null;
  mentorPhoto: string | null; // absolute URL
  studentsEnrolled: number | null;
  duration: string | null;
  totalLessons: number | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface CourseContentItem {
  id: string | number;
  courseId: string | number;
  parentId: string | number | null;
  type: 'folder' | 'pdf' | 'video' | 'note' | string;
  title: string;
  url: string | null;
  media_url?: string | null;
  mediaUrl?: string | null;
  file_size?: string | null;
  fileSize?: string | null;
  order?: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Fetch JSON from the API. Pass `authenticated` to send the signed-in user's Firebase ID token. */
async function apiGet<T>(path: string, { authenticated = false } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (authenticated) {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new ApiError(401, 'Please sign in');
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}/api${path}`, { headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export const fetchCourses = async (categorySlug?: string): Promise<Course[]> => {
  try {
    const query = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : '';
    return await apiGet<Course[]>(`/courses${query}`);
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return [];
  }
};

/** Returns null when the course does not exist or is not published. */
export const fetchCourse = async (id: string | number): Promise<Course | null> => {
  try {
    return await apiGet<Course>(`/courses/${encodeURIComponent(String(id))}`);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      console.error("Failed to fetch course:", error);
    }
    return null;
  }
};

export const fetchCategories = async (): Promise<Category[]> => {
  try {
    return await apiGet<Category[]>('/categories');
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return [];
  }
};

/** Purchased content. Throws ApiError 401/403 if the user is not signed in or has not bought the course. */
export const fetchCourseContent = async (courseId: number | string): Promise<CourseContentItem[]> => {
  try {
    const res: any = await apiGet<any>(`/courses/${courseId}/content`, { authenticated: true }).catch(async () => {
      return await apiGet<any>(`/content/${courseId}`, { authenticated: true });
    });
    const dataArray = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res)
      ? res
      : (res?.data?.data || res?.data?.content || res?.content || []);
    return Array.isArray(dataArray) ? dataArray : [];
  } catch (error) {
    console.error("Failed to fetch course content:", error);
    return [];
  }
};
