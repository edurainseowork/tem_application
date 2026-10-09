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
import * as tus from 'tus-js-client';

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

function parseS3Error(responseText: string): { code?: string; message?: string } {
  try {
    const codeMatch = responseText.match(/<Code>(.*?)<\/Code>/i);
    const messageMatch = responseText.match(/<Message>(.*?)<\/Message>/i);
    return {
      code: codeMatch ? codeMatch[1] : undefined,
      message: messageMatch ? messageMatch[1] : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Upload raw binary file to the presigned S3 PUT URL with real-time progress tracking.
 * Uses native XMLHttpRequest to avoid extra dependencies and accurately monitor progress events.
 * 
 * @param uploadUrl Presigned S3 PUT URL obtained from getUploadPresignedUrl
 * @param file The File object (PDF or Video) to upload
 * @param onProgress Callback receiving progress percentage (0 to 100)
 * @param signal Optional AbortSignal to cancel in-flight upload
 * @param contentType Optional explicit MIME type that was signed in the Presigned URL
 * @returns {Promise<{ success: boolean; status: number }>}
 */
export function uploadFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
  contentType?: string
): Promise<{ success: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Upload aborted by caller'));
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);

    // Resolve and strictly normalize Content-Type header to match S3 signed signature
    const resolvedContentType = (
      contentType ||
      file.type ||
      (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
    ).toLowerCase().trim().split(';')[0];

    xhr.setRequestHeader('Content-Type', resolvedContentType);

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
        const rawXml = xhr.responseText || '';
        const { code, message } = parseS3Error(rawXml);
        const detail = code
          ? `S3 Error [${code}]: ${message || 'No message provided'}`
          : (rawXml || xhr.statusText || 'Unknown S3 error');

        console.error(`[uploadService] Direct S3 upload rejected (HTTP ${xhr.status}):`, {
          httpStatus: xhr.status,
          statusText: xhr.statusText,
          s3ErrorCode: code,
          s3ErrorMessage: message,
          rawXml,
          uploadUrl: uploadUrl.replace(/\?.*$/, '?<presigned-params-hidden>'),
          file: { name: file.name, size: file.size, type: file.type, resolvedContentType },
        });

        reject(new Error(`S3 upload failed (HTTP ${xhr.status}): ${detail}`));
      }
    };

    // Network / CORS error handlers
    xhr.onerror = () => {
      console.error('[uploadService] XMLHttpRequest network/CORS error:', {
        status: xhr.status,
        readyState: xhr.readyState,
        statusText: xhr.statusText,
        uploadUrl: uploadUrl.replace(/\?.*$/, '?<presigned-params-hidden>'),
        origin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
        file: { name: file.name, size: file.size, type: file.type, resolvedContentType },
      });

      reject(
        new Error(
          `Failed uploading directly to Amazon S3 (HTTP Status ${xhr.status || 0}). ` +
          `This typically indicates that Amazon S3 rejected the preflight OPTIONS request due to a missing or misconfigured S3 Bucket CORS policy for origin '${typeof window !== 'undefined' ? window.location.origin : 'CMS origin'}', ` +
          `or an active network block. Please check the S3 Bucket CORS configuration.`
        )
      );
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
  const mimeType = (
    file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
  ).toLowerCase().trim().split(';')[0];

  // 1. Get presigned PUT URL
  const { uploadUrl, key, fileUrl } = await getUploadPresignedUrl(
    file.name,
    mimeType,
    courseId
  );

  // 2. Upload to S3 with progress and explicit matched Content-Type
  await uploadFileWithProgress(uploadUrl, file, onProgress, signal, mimeType);

  return { fileUrl, key };
}

export interface VideoUploadMetadata {
  title?: string;
  description?: string;
}

export interface VideoUploadResult {
  vimeoVideoId?: string; // backwards compatibility alias
  videoId: string;
  playerUrl: string;
  directUrl?: string;
}

// Deprecated alias for backwards compatibility
export type VimeoUploadMetadata = VideoUploadMetadata;
export type VimeoUploadResult = VideoUploadResult;

/**
 * Direct client-to-Bunny.net Stream resumable video upload via TUS protocol.
 * High-performance video streaming with multi-quality transcoding.
 * 
 * @param file The video file to upload directly to Bunny Stream
 * @param metadata Optional video metadata (title, description)
 * @param onProgressCallback Optional progress callback (0-100)
 * @param signal Optional AbortSignal to cancel upload
 */
export async function uploadTeacherVideo(
  file: File,
  metadata: VideoUploadMetadata = {},
  onProgressCallback?: ProgressCallback,
  signal?: AbortSignal
): Promise<VideoUploadResult> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Step A: Request Bunny Stream upload ticket & TUS signature from backend
  const backendRes = await fetch(`${API_BASE_URL}/api/videos/initiate-upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
      description: metadata.description || '',
      fileSize: file.size,
    }),
  });

  const resData = await backendRes.json().catch(() => ({}));
  if (!backendRes.ok || (!resData.signature && !resData.uploadLink)) {
    throw new Error(resData?.error || `Could not obtain video upload ticket (${backendRes.status})`);
  }

  const { videoId, libraryId, signature, expire, playerUrl, directUrl } = resData;

  // Step B: Direct resumable upload to Bunny Stream via TUS
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Upload aborted by caller'));
    }

    const tusHeaders: Record<string, string> = {};
    if (signature && libraryId && videoId) {
      tusHeaders['AuthorizationSignature'] = signature;
      tusHeaders['AuthorizationExpire'] = String(expire);
      tusHeaders['VideoId'] = videoId;
      tusHeaders['LibraryId'] = String(libraryId);
    }

    const upload = new tus.Upload(file, {
      endpoint: resData.uploadEndpoint || 'https://video.bunnycdn.com/tusupload',
      uploadUrl: resData.uploadLink && !signature ? resData.uploadLink : undefined,
      retryDelays: [0, 3000, 5000, 10000],
      chunkSize: 5 * 1024 * 1024, // 5MB chunks
      headers: tusHeaders,
      metadata: {
        filetype: file.type || 'video/mp4',
        title: metadata.title || file.name,
      },
      onError: (error) => {
        console.error('Bunny Stream TUS Upload failed:', error);
        reject(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(1);
        if (onProgressCallback) {
          onProgressCallback(Number(percentage));
        }
      },
      onSuccess: () => {
        console.log('Upload complete. Bunny Video ID:', videoId);
        resolve({
          vimeoVideoId: videoId,
          videoId,
          playerUrl: playerUrl || `https://iframe.mediadelivery.net/${libraryId}/${videoId}`,
          directUrl,
        });
      },
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        upload.abort();
        reject(new Error('Upload was cancelled'));
      });
    }

    upload.start();
  });
}

export default {
  getUploadPresignedUrl,
  uploadFileWithProgress,
  uploadMediaToS3,
  uploadTeacherVideo,
};

