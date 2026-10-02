import { useState, useRef, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {
  getPresignedUploadUrl,
  uploadFileToS3,
  createContentNode,
} from '../services/contentService';
import type { ContentItem, ContentType } from '../types/content';

export type UploaderMediaType = 'pdf' | 'video' | 'any';

export interface PickAndUploadOptions {
  courseId: string;
  currentFolderId?: string | null;
  mediaType?: UploaderMediaType;
  customTitle?: string;
  onProgress?: (progress: number) => void;
}

export interface UseMediaUploaderReturn {
  uploading: boolean;
  uploadProgress: number;
  currentFileName: string | null;
  error: string | null;
  pickAndUpload: (options: PickAndUploadOptions) => Promise<ContentItem | null>;
  pickAndUploadPdf: (
    courseId: string,
    currentFolderId?: string | null,
    customTitle?: string
  ) => Promise<ContentItem | null>;
  pickAndUploadVideo: (
    courseId: string,
    currentFolderId?: string | null,
    customTitle?: string
  ) => Promise<ContentItem | null>;
  cancelUpload: () => void;
  reset: () => void;
}

/**
 * Formats a byte count into a human-readable string (e.g., 2.4 MB).
 */
export function formatFileSize(bytes?: number): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Normalizes and infers MIME types from file extensions when missing.
 */
function resolveMimeType(fileName: string, rawMimeType?: string): string {
  const lowerName = fileName.toLowerCase();
  if (rawMimeType && rawMimeType !== 'application/octet-stream') {
    return rawMimeType.split(';')[0].trim().toLowerCase();
  }

  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.mp4')) return 'video/mp4';
  if (lowerName.endsWith('.mov')) return 'video/quicktime';
  if (lowerName.endsWith('.mkv')) return 'video/x-matroska';
  if (lowerName.endsWith('.webm')) return 'video/webm';
  return 'application/pdf';
}

/**
 * Performs direct S3 upload with progress monitoring and abort signal support.
 */
function uploadDirectToS3WithProgress(
  presignedUrl: string,
  fileUri: string,
  mimeType: string,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    if (abortSignal?.aborted) {
      return reject(new Error('Upload cancelled'));
    }

    try {
      // Fetch file data into a Blob
      const fileResponse = await fetch(fileUri);
      if (!fileResponse.ok) {
        return reject(new Error(`Failed to read file from URI: ${fileResponse.statusText}`));
      }
      const blob = await fileResponse.blob();

      // Check if XMLHttpRequest is available for fine-grained progress
      if (typeof XMLHttpRequest !== 'undefined') {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', mimeType);

        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            xhr.abort();
            reject(new Error('Upload cancelled'));
          });
        }

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            onProgress?.(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100);
            resolve();
          } else {
            reject(
              new Error(
                `S3 upload failed with status ${xhr.status}: ${xhr.responseText || xhr.statusText}`
              )
            );
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during S3 upload'));
        };

        xhr.onabort = () => {
          reject(new Error('Upload cancelled'));
        };

        xhr.send(blob);
      } else {
        // Fallback to fetch with uploadFileToS3
        onProgress?.(50);
        await uploadFileToS3(presignedUrl, fileUri, mimeType);
        onProgress?.(100);
        resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Custom hook to handle picking PDF or video files via expo-document-picker,
 * requesting an AWS S3 presigned URL, uploading directly to S3 with progress,
 * and saving the content item to the database.
 */
export function useMediaUploader(): UseMediaUploaderReturn {
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  /**
   * Resets the uploader state.
   */
  const reset = useCallback(() => {
    setUploading(false);
    setUploadProgress(0);
    setCurrentFileName(null);
    setError(null);
    isCancelledRef.current = false;
    abortControllerRef.current = null;
  }, []);

  /**
   * Cancels the active upload process.
   */
  const cancelUpload = useCallback(() => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploading(false);
    setUploadProgress(0);
    setError('Upload cancelled by user');
  }, []);

  /**
   * Main upload workflow:
   * a. Trigger DocumentPicker.getDocumentAsync
   * b. Extract file name, size, and MIME type
   * c. Call getPresignedUploadUrl
   * d. Execute direct S3 PUT upload
   * e. Call createContentNode to save the uploaded asset into the database
   */
  const pickAndUpload = useCallback(
    async (options: PickAndUploadOptions): Promise<ContentItem | null> => {
      const {
        courseId,
        currentFolderId = null,
        mediaType = 'any',
        customTitle,
        onProgress,
      } = options;

      reset();
      isCancelledRef.current = false;

      // 1. Determine picker MIME types
      let pickerTypes: string[] = ['application/pdf', 'video/*'];
      if (mediaType === 'pdf') {
        pickerTypes = ['application/pdf'];
      } else if (mediaType === 'video') {
        pickerTypes = ['video/*'];
      }

      // Step a: Trigger DocumentPicker.getDocumentAsync
      let pickerResult: DocumentPicker.DocumentPickerResult;
      try {
        pickerResult = await DocumentPicker.getDocumentAsync({
          type: pickerTypes,
          copyToCacheDirectory: true,
          multiple: false,
        });
      } catch (err: any) {
        console.error('[useMediaUploader] File picker error:', err);
        setError(err.message || 'Failed to open file picker');
        return null;
      }

      // User cancelled picker
      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return null;
      }

      // Step b: Extract file name, size, and MIME type
      const asset = pickerResult.assets[0];
      const fileName = asset.name || `file_${Date.now()}`;
      const mimeType = resolveMimeType(fileName, asset.mimeType);
      const isPdf = mimeType === 'application/pdf';
      const contentType: ContentType = isPdf ? 'pdf' : 'video';
      const title = customTitle?.trim() || fileName.replace(/\.[^/.]+$/, '');

      setCurrentFileName(fileName);
      setUploading(true);
      setUploadProgress(0);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Cancellation guard check
        if (isCancelledRef.current || abortController.signal.aborted) {
          throw new Error('Upload cancelled');
        }

        // Step c: Call getPresignedUploadUrl
        const presigned = await getPresignedUploadUrl(fileName, mimeType, courseId);

        // Cancellation guard check
        if (isCancelledRef.current || abortController.signal.aborted) {
          throw new Error('Upload cancelled');
        }

        // Step d: Execute direct S3 PUT upload
        await uploadDirectToS3WithProgress(
          presigned.uploadUrl,
          asset.uri,
          mimeType,
          (percent) => {
            if (!isCancelledRef.current) {
              setUploadProgress(percent);
              onProgress?.(percent);
            }
          },
          abortController.signal
        );

        // Cancellation guard check before saving record
        if (isCancelledRef.current || abortController.signal.aborted) {
          throw new Error('Upload cancelled');
        }

        // Step e: Call createContentNode to save the uploaded asset into the database
        const createdNode = await createContentNode({
          courseId,
          parentId: currentFolderId,
          title,
          type: contentType,
          mediaUrl: presigned.fileUrl,
          fileSize: formatFileSize(asset.size),
        });

        setUploadProgress(100);
        return createdNode;
      } catch (err: any) {
        if (isCancelledRef.current || err.message?.includes('cancelled')) {
          console.warn('[useMediaUploader] Upload process cancelled');
          return null;
        }
        console.error('[useMediaUploader] Upload error:', err);
        setError(err.message || 'Upload failed');
        throw err;
      } finally {
        setUploading(false);
        abortControllerRef.current = null;
      }
    },
    [reset]
  );

  /**
   * Convenience helper to pick and upload a PDF.
   */
  const pickAndUploadPdf = useCallback(
    (courseId: string, currentFolderId?: string | null, customTitle?: string) => {
      return pickAndUpload({
        courseId,
        currentFolderId,
        mediaType: 'pdf',
        customTitle,
      });
    },
    [pickAndUpload]
  );

  /**
   * Convenience helper to pick and upload a Video.
   */
  const pickAndUploadVideo = useCallback(
    (courseId: string, currentFolderId?: string | null, customTitle?: string) => {
      return pickAndUpload({
        courseId,
        currentFolderId,
        mediaType: 'video',
        customTitle,
      });
    },
    [pickAndUpload]
  );

  return {
    uploading,
    uploadProgress,
    currentFileName,
    error,
    pickAndUpload,
    pickAndUploadPdf,
    pickAndUploadVideo,
    cancelUpload,
    reset,
  };
}

export default useMediaUploader;
