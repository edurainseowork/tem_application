import { auth } from './firebase';

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
};

// Every CMS request carries the admin's Firebase ID token; the backend verifies it
// and checks the `admin` custom claim. Nothing here is trusted by the server.
export async function apiFetch<T = any>(path: string, { method = 'GET', body, formData }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await auth.currentUser?.getIdToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = Array.isArray(data.issues)
      ? ': ' + data.issues.map((i: { path: string; message: string }) => (i.path ? `${i.path} – ${i.message}` : i.message)).join('; ')
      : '';
    throw new ApiError(res.status, (data.error || `Request failed (${res.status})`) + issues);
  }
  return data as T;
}

/** Uploads a file (image or PDF) and returns its server-relative path, e.g. "/uploads/<id>.png". */
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const data = await apiFetch<{ url: string }>('/upload', { method: 'POST', formData });
  return data.url;
}

export type Category = {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
  courseCount: number;
};
export type CourseMentor = {
  name: string;
  experience: string | null;
  photo: string | null; // absolute URL
};

export type AdminCourse = {
  id: number;
  title: string;
  description: string;
  price: number; // paise
  originalPrice: number | null; // paise
  thumbnail: string; // absolute URL
  category: string;
  categoryId: number | null;
  categorySlug: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  enrollmentCount: number;
    mentors: CourseMentor[]; // absolute URL
  studentsEnrolled: number | null;
  duration: string | null;
  totalLessons: number | null;
};

export const MAX_UPLOAD_BYTES = 500 * 1024;

export const rupeesToPaise = (rupees: string) => Math.round(Number(rupees) * 100);
export const paiseToRupees = (paise: number) => (paise / 100).toString();
export const formatINR = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
