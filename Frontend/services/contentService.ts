import Constants from 'expo-constants';
import { auth } from '../firebaseConfig';
import type { ContentItem, ContentType, PresignedUploadResponse } from '../types/content';

/**
 * Dynamically resolves the API base URL:
 * - Uses process.env.EXPO_PUBLIC_API_URL if provided
 * - In local dev with Expo, uses the host IP for real devices / emulators
 * - Defaults to 'http://localhost:5000'
 */
export const getBaseUrl = (): string => {
  let url = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && Constants?.expoConfig?.hostUri) {
      const host = Constants.expoConfig.hostUri.split(':')[0];
      if (host) {
        url = `http://${host}:5000`;
      }
    }
  } catch {
    // Fall back to default URL
  }
  return url.replace(/\/+$/, '');
};

export const API_BASE_URL = getBaseUrl();

let customTokenProvider: (() => Promise<string | null> | string | null) | null = null;

/**
 * Allows overriding or mocking the auth token provider (useful for testing and CI).
 */
export const setAuthTokenProvider = (
  provider: (() => Promise<string | null> | string | null) | null
) => {
  customTokenProvider = provider;
};

/**
 * Retrieves the current Firebase Auth ID token if a user is signed in.
 */
export const getAuthToken = async (): Promise<string | null> => {
  if (customTokenProvider) {
    try {
      return await customTokenProvider();
    } catch (err) {
      console.warn('[contentService] Error from custom token provider:', err);
    }
  }

  try {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (error) {
    console.warn('[contentService] Error getting auth token:', error);
  }
  return null;
};

/**
 * Helper to make HTTP requests with automatic Firebase auth token injection.
 */
async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  let data: any;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (typeof data === 'object' && data !== null && (data.error || data.message)) ||
      `Request failed with status ${response.status}`;
    const error = new Error(message) as Error & { status?: number; data?: any };
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

/**
 * Fetches course content hierarchy (GET /api/courses/:id/content).
 * - If parentId is omitted or null, returns root items.
 * - If parentId is provided, returns items nested within that folder.
 */
export async function fetchCourseContent(
  courseId: string,
  parentId?: string | null
): Promise<ContentItem[]> {
  let endpoint = `/api/courses/${encodeURIComponent(courseId)}/content`;
  if (parentId !== undefined) {
    endpoint += `?parentId=${encodeURIComponent(parentId === null ? 'null' : parentId)}`;
  }

  const res: any = await apiRequest<any>(
    endpoint,
    { method: 'GET' }
  );

  const dataArray = Array.isArray(res?.data)
    ? res.data
    : Array.isArray(res)
    ? res
    : (res?.data?.data || res?.data?.content || res?.content || []);

  return Array.isArray(dataArray) ? dataArray : [];
}

/**
 * Creates a new content item node (folder, video, pdf, note, or quiz) (POST /api/content).
 */
export async function createContentNode(data: {
  courseId: string;
  parentId?: string | null;
  title: string;
  type: ContentType;
  mediaUrl?: string;
  fileSize?: string;
  order?: number;
}): Promise<ContentItem> {
  const result = await apiRequest<{ success: boolean; data: ContentItem } | ContentItem>(
    '/api/content',
    {
      method: 'POST',
      body: JSON.stringify({
        courseId: data.courseId,
        parentId: data.parentId === undefined ? null : data.parentId,
        title: data.title,
        type: data.type,
        mediaUrl: data.mediaUrl,
        fileSize: data.fileSize,
        order: data.order,
      }),
    }
  );

  if ('data' in result && result.data) {
    return result.data;
  }
  return result as ContentItem;
}

/**
 * Updates a content node (PATCH /api/content/:id).
 */
export async function updateContentNode(
  id: string,
  updates: Partial<ContentItem>
): Promise<ContentItem> {
  const result = await apiRequest<{ success: boolean; data: ContentItem } | ContentItem>(
    `/api/content/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );

  if ('data' in result && result.data) {
    return result.data;
  }
  return result as ContentItem;
}

/**
 * Reorders content items via batch transaction (PATCH /api/content/reorder).
 */
export async function reorderContentNodes(
  items: Array<{ id: string; order: number }>
): Promise<void> {
  await apiRequest<{ success: boolean; message: string; count: number }>(
    '/api/content/reorder',
    {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    }
  );
}

/**
 * Deletes a content node and cascades down all children (DELETE /api/content/:id).
 */
export async function deleteContentNode(id: string): Promise<void> {
  await apiRequest<{ success: boolean; deletedCount: number; deletedIds: string[] }>(
    `/api/content/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Requests an AWS S3 presigned PUT URL for media uploads (POST /api/upload).
 */
export async function getPresignedUploadUrl(
  fileName: string,
  fileType: string,
  courseId: string
): Promise<PresignedUploadResponse> {
  return await apiRequest<PresignedUploadResponse>(
    '/api/upload',
    {
      method: 'POST',
      body: JSON.stringify({
        fileName,
        fileType,
        courseId,
      }),
    }
  );
}

/**
 * Uploads a local file directly to AWS S3 using a presigned PUT URL.
 * Supports fetch/blob universally, with fallback support for Expo FileSystem if installed.
 */
export async function uploadFileToS3(
  presignedUrl: string,
  fileUri: string,
  mimeType: string
): Promise<void> {
  try {
    // Check if expo-file-system is available on native platform
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system');
    if (
      FileSystem &&
      typeof FileSystem.uploadAsync === 'function' &&
      typeof fileUri === 'string' &&
      (fileUri.startsWith('file://') || fileUri.startsWith('/'))
    ) {
      const uploadResult = await FileSystem.uploadAsync(presignedUrl, fileUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType?.BINARY_CONTENT ?? 0,
        headers: {
          'Content-Type': mimeType,
        },
      });
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(
          `S3 upload failed with status ${uploadResult.status}: ${uploadResult.body}`
        );
      }
      return;
    }
  } catch (fsErr: any) {
    if (fsErr?.message?.includes('S3 upload failed')) {
      throw fsErr;
    }
  }

  // Universal fetch + blob implementation
  const fileResponse = await fetch(fileUri);
  if (!fileResponse.ok) {
    throw new Error(
      `Failed to read file from URI "${fileUri}": ${fileResponse.statusText} (${fileResponse.status})`
    );
  }
  const fileBlob = await fileResponse.blob();

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: fileBlob,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => '');
    throw new Error(
      `S3 upload failed with status ${uploadResponse.status}: ${errorText || uploadResponse.statusText}`
    );
  }
}

const contentService = {
  fetchCourseContent,
  createContentNode,
  updateContentNode,
  reorderContentNodes,
  deleteContentNode,
  getPresignedUploadUrl,
  uploadFileToS3,
  getBaseUrl,
  getAuthToken,
  setAuthTokenProvider,
};

export default contentService;
