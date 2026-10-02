import { useState, useEffect, useRef, useCallback } from 'react';
import type { ContentItem } from '../types/content';
import {
  fetchCourseContent,
  createContentNode,
  reorderContentNodes,
  deleteContentNode,
} from '../services/contentService';

export interface UseCourseContentManagerOptions {
  autoFetch?: boolean;
}

export interface UseCourseContentManagerReturn {
  courseId: string;
  currentFolder: ContentItem | null;
  folderHistory: ContentItem[];
  items: ContentItem[];
  loading: boolean;
  uploading: boolean;
  uploadProgress: number;
  error: string | null;
  navigateIntoFolder: (folder: ContentItem) => Promise<void>;
  navigateUp: () => Promise<void>;
  navigateToBreadcrumb: (targetIndex: number) => Promise<void>;
  reorderItem: (fromIndex: number, toIndex: number) => void;
  refresh: () => Promise<void>;
  createFolder: (title: string) => Promise<ContentItem>;
  deleteItem: (id: string) => Promise<void>;
  setItems: React.Dispatch<React.SetStateAction<ContentItem[]>>;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setError: (error: string | null) => void;
}

/**
 * Custom hook to manage course content folder navigation, breadcrumbs,
 * loading state, and debounced item reordering.
 */
export function useCourseContentManager(
  courseId: string,
  options: UseCourseContentManagerOptions = { autoFetch: true }
): UseCourseContentManagerReturn {
  const [currentFolder, setCurrentFolder] = useState<ContentItem | null>(null);
  const [folderHistory, setFolderHistory] = useState<ContentItem[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fetches content items for the active folder or root level.
   */
  const loadContent = useCallback(
    async (folderId: string | null) => {
      if (!courseId) return;
      setLoading(true);
      setError(null);
      try {
        const res: any = await fetchCourseContent(courseId, folderId);
        const dataArray = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
          ? res
          : (res?.data?.data || res?.data?.content || res?.content || []);
        const safeArray = Array.isArray(dataArray) ? dataArray : [];
        // Sort items ascending by order
        const sorted = [...safeArray].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setItems(sorted);
      } catch (err: any) {
        console.error('[useCourseContentManager] Failed to fetch content:', err);
        setError(err.message || 'Failed to load course content');
      } finally {
        setLoading(false);
      }
    },
    [courseId]
  );

  /**
   * Initial fetch on mount or when courseId changes.
   */
  useEffect(() => {
    if (options.autoFetch && courseId) {
      setCurrentFolder(null);
      setFolderHistory([]);
      loadContent(null);
    }
  }, [courseId, options.autoFetch, loadContent]);

  /**
   * Clean up pending debounce timers on unmount.
   */
  useEffect(() => {
    return () => {
      if (reorderTimerRef.current) {
        clearTimeout(reorderTimerRef.current);
      }
    };
  }, []);

  /**
   * Navigates into a child folder: pushes to history and fetches nested children.
   */
  const navigateIntoFolder = useCallback(
    async (folder: ContentItem) => {
      if (folder.type !== 'folder') return;
      setFolderHistory((prev) => [...prev, folder]);
      setCurrentFolder(folder);
      await loadContent(folder.id);
    },
    [loadContent]
  );

  /**
   * Navigates up one folder level: pops from history back to parent folder or root.
   */
  const navigateUp = useCallback(async () => {
    if (folderHistory.length === 0) {
      // Already at root level
      return;
    }

    const nextHistory = folderHistory.slice(0, -1);
    const parentFolder = nextHistory.length > 0 ? nextHistory[nextHistory.length - 1] : null;

    setFolderHistory(nextHistory);
    setCurrentFolder(parentFolder);
    await loadContent(parentFolder ? parentFolder.id : null);
  }, [folderHistory, loadContent]);

  /**
   * Jumps directly to a specific breadcrumb level.
   * targetIndex: -1 for root, or 0..folderHistory.length - 1 for specific folders.
   */
  const navigateToBreadcrumb = useCallback(
    async (targetIndex: number) => {
      if (targetIndex < 0) {
        // Return to root
        setFolderHistory([]);
        setCurrentFolder(null);
        await loadContent(null);
        return;
      }

      if (targetIndex >= folderHistory.length) return;

      const nextHistory = folderHistory.slice(0, targetIndex + 1);
      const targetFolder = nextHistory[nextHistory.length - 1];

      setFolderHistory(nextHistory);
      setCurrentFolder(targetFolder);
      await loadContent(targetFolder.id);
    },
    [folderHistory, loadContent]
  );

  /**
   * Reorders items: swaps order in local state optimistically,
   * then debounces calling the backend reorderContentNodes endpoint.
   */
  const reorderItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (
        fromIndex < 0 ||
        fromIndex >= items.length ||
        toIndex < 0 ||
        toIndex >= items.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      // 1. Optimistic state reorder
      const reorderedList = [...items];
      const [movedItem] = reorderedList.splice(fromIndex, 1);
      reorderedList.splice(toIndex, 0, movedItem);

      // Re-assign sequential order numbers
      const updatedItems = reorderedList.map((item, index) => ({
        ...item,
        order: index,
      }));

      setItems(updatedItems);

      // 2. Debounce persistence to backend
      if (reorderTimerRef.current) {
        clearTimeout(reorderTimerRef.current);
      }

      reorderTimerRef.current = setTimeout(async () => {
        try {
          const payload = updatedItems.map((item) => ({
            id: item.id,
            order: item.order,
          }));
          await reorderContentNodes(payload);
        } catch (err: any) {
          console.error('[useCourseContentManager] Failed to persist reordering:', err);
          setError(err.message || 'Failed to save item reordering');
        }
      }, 400);
    },
    [items]
  );

  /**
   * Refreshes the active folder or root level.
   */
  const refresh = useCallback(async () => {
    await loadContent(currentFolder ? currentFolder.id : null);
  }, [currentFolder, loadContent]);

  /**
   * Creates a new folder inside the current directory level.
   */
  const createFolder = useCallback(
    async (title: string): Promise<ContentItem> => {
      setLoading(true);
      setError(null);
      try {
        const newFolder = await createContentNode({
          courseId,
          parentId: currentFolder ? currentFolder.id : null,
          title: title.trim(),
          type: 'folder',
        });
        setItems((prev) => [...prev, newFolder].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        return newFolder;
      } catch (err: any) {
        console.error('[useCourseContentManager] Failed to create folder:', err);
        setError(err.message || 'Failed to create folder');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [courseId, currentFolder]
  );

  /**
   * Deletes a content node and removes it from the current view.
   */
  const deleteItem = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteContentNode(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      console.error('[useCourseContentManager] Failed to delete content item:', err);
      setError(err.message || 'Failed to delete item');
      throw err;
    }
  }, []);

  return {
    courseId,
    currentFolder,
    folderHistory,
    items,
    loading,
    uploading,
    uploadProgress,
    error,
    navigateIntoFolder,
    navigateUp,
    navigateToBreadcrumb,
    reorderItem,
    refresh,
    createFolder,
    deleteItem,
    setItems,
    setUploading,
    setUploadProgress,
    setError,
  };
}

export default useCourseContentManager;
