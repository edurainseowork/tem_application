/**
 * S3 Presigned Upload Service for CMS-Portal
 * Compliant with PRD Section 6.3 (Media Storage) & Section 6.5 (File Ingestion Architecture)
 * 
 * 1. getUploadPresignedUrl:
 *    - Calls POST /api/upload with Bearer token authentication
 *    - Returns { uploadUrl, key, fileUrl }
 * 
 * 2. uploadFileWithProgress:
 *    - Uses XMLHttpRequest to stream raw binary via PUT to the presigned S3 uploadUrl
 *    - Tracks real-time upload progress percentage (0-100%) for UI feedback
 */

import { auth } from '../firebase';
import { API_BASE_URL, ApiError } from '../api';

export interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  fileUrl: string;
}

export type ProgressCallback = (percent: number) => void;

export interface UploadOptions {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

/**
 * Request a short-lived AWS S3 Presigned PUT URL from the backend.
 * 
 * @param fileName Name of the file (e.g., "lecture1.mp4", "notes.pdf")
 * @param fileType MIME type (e.g., "application/pdf", "video/mp4")
 * @param courseId ID of the course the asset belongs to
 * @param authToken Optional explicit Bearer token (defaults to Firebase auth.currentUser ID token)
 * @returns {Promise<PresignedUrlResponse>} { uploadUrl, key, fileUrl }
 */
export async function getUploadPresignedUrl(
  fileName: string,
  fileType: string,
  courseId: string | number,
  authToken?: string
): Promise<PresignedUrlResponse> {
  const token = authToken || (await auth.currentUser?.getIdToken());
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName,
      fileType,
      courseId: String(courseId),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error || `Failed to get presigned upload URL (${response.status})`;
    throw new ApiError(response.status, errorMsg);
  }

  return {
    uploadUrl: data.uploadUrl,
    key: data.key,
    fileUrl: data.fileUrl,
  };
}

/**
 * Upload raw binary file to the presigned S3 PUT URL with real-time progress tracking.
 * Uses native XMLHttpRequest to avoid extra dependencies and accurately monitor progress events.
 * 
 * @param uploadUrl Presigned S3 PUT URL obtained from getUploadPresignedUrl
 * @param file The File object (PDF or Video) to upload
 * @param onProgress Callback receiving progress percentage (0 to 100)
 * @param signal Optional AbortSignal to cancel in-flight upload
 * @returns {Promise<{ success: boolean; status: number }>}
 */
export function uploadFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<{ success: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Upload aborted by caller'));
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);

    // Set matching Content-Type header for S3 PUT signature match
    if (file.type) {
      xhr.setRequestHeader('Content-Type', file.type);
    }

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new Error('Upload aborted by user'));
      });
    }

    // Track upload progress events
    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        if (onProgress) {
          onProgress(percent);
        }
      }
    };

    // Upload completion handler
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) {
          onProgress(100);
        }
        resolve({ success: true, status: xhr.status });
      } else {
        const errText = xhr.responseText || xhr.statusText || 'Unknown error';
        reject(new Error(`S3 upload failed with status ${xhr.status}: ${errText}`));
      }
    };

    // Network / error handlers
    xhr.onerror = () => {
      reject(new Error('Network error during file upload to S3. Please check your connection.'));
    };

    xhr.onabort = () => {
      reject(new Error('Upload was cancelled'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out'));
    };

    // Send the raw binary file stream
    xhr.send(file);
  });
}

/**
 * End-to-end convenience utility:
 * 1. Obtains S3 Presigned URL from backend
 * 2. Uploads the raw binary with progress tracking
 * 3. Returns the public fileUrl and S3 key
 * 
 * @param file File to upload
 * @param courseId ID of course
 * @param onProgress Optional progress callback (0-100)
 * @param signal Optional abort signal
 */
export async function uploadMediaToS3(
  file: File,
  courseId: string | number,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<{ fileUrl: string; key: string }> {
  // 1. Get presigned PUT URL
  const { uploadUrl, key, fileUrl } = await getUploadPresignedUrl(
    file.name,
    file.type || 'application/octet-stream',
    courseId
  );

  // 2. Upload to S3 with progress
  await uploadFileWithProgress(uploadUrl, file, onProgress, signal);

  return { fileUrl, key };
}

export default {
  getUploadPresignedUrl,
  uploadFileWithProgress,
  uploadMediaToS3,
};
