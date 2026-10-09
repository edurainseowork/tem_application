import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch, type AdminCourse } from '../api';
import { getUploadPresignedUrl, uploadFileWithProgress, uploadTeacherVideo } from '../services/uploadService';

export type ContentType = 'folder' | 'video' | 'pdf' | 'note';

export interface ContentItem {
  id: string;
  courseId: number | string;
  parentId: string | null;
  title: string;
  type: ContentType;
  mediaUrl: string | null;
  url?: string | null;
  fileSize?: string | null;
  order: number;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BreadcrumbNode {
  id: string | null; // null represents Root
  title: string;
}

interface CourseContentManagerProps {
  courses?: AdminCourse[];
  selectedCourseId?: string | number;
  onSelectCourse?: (id: string) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function CourseContentManager({
  courses = [],
  selectedCourseId: initialSelectedCourseId,
  onSelectCourse,
  showToast: externalToast,
}: CourseContentManagerProps) {
  // Course State
  const [activeCourseId, setActiveCourseId] = useState<string>(
    initialSelectedCourseId ? String(initialSelectedCourseId) : ''
  );

  // Content Hierarchy & Navigation State
  const [currentFolder, setCurrentFolder] = useState<ContentItem | null>(null);
  const [folderHistory, setFolderHistory] = useState<ContentItem[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [allCourseItems, setAllCourseItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>('');

  // Toast Helper
  const toast = useCallback(
    (msg: string, type: 'success' | 'error' = 'success') => {
      if (externalToast) {
        externalToast(msg, type);
      } else {
        alert(`${type.toUpperCase()}: ${msg}`);
      }
    },
    [externalToast]
  );

  // Synchronize initial course if prop changes
  useEffect(() => {
    if (initialSelectedCourseId) {
      setActiveCourseId(String(initialSelectedCourseId));
    }
  }, [initialSelectedCourseId]);

  // Handle Course Switching
  const handleCourseChange = (newCourseId: string) => {
    setActiveCourseId(newCourseId);
    setCurrentFolder(null);
    setFolderHistory([]);
    if (onSelectCourse) {
      onSelectCourse(newCourseId);
    }
  };

  // Find active course metadata
  const currentCourse = useMemo(() => {
    return courses.find((c) => String(c.id) === activeCourseId) || null;
  }, [courses, activeCourseId]);

  // Fetch all items for the course (to compute folder counts) and current folder items
  const fetchContents = useCallback(
    async (courseId: string, folderId: string | null) => {
      if (!courseId) {
        setItems([]);
        setAllCourseItems([]);
        return;
      }

      setLoading(true);
      try {
        // 1. Fetch current folder items
        const parentParam = folderId ? `?parentId=${encodeURIComponent(folderId)}` : '?parentId=null';
        const res = await apiFetch<{ success: boolean; data: ContentItem[] }>(
          `/courses/${courseId}/content${parentParam}`
        );

        if (res.success && Array.isArray(res.data)) {
          setItems(res.data);
        }

        // 2. Fetch full tree (parentId=all) to calculate nested item counts
        try {
          const allRes = await apiFetch<{ success: boolean; data: ContentItem[] }>(
            `/courses/${courseId}/content?parentId=all`
          );
          if (allRes.success && Array.isArray(allRes.data)) {
            setAllCourseItems(allRes.data);
          }
        } catch {
          // Non-critical, folder count will fallback to current level
        }
      } catch (err: any) {
        console.error('[CourseContentManager] Failed to fetch content:', err);
        toast(`Failed to load content: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  // Reload when course or folder changes
  useEffect(() => {
    if (activeCourseId) {
      fetchContents(activeCourseId, currentFolder ? currentFolder.id : null);
    } else {
      setItems([]);
    }
  }, [activeCourseId, currentFolder, fetchContents]);

  // Calculate folder item counts from allCourseItems
  const folderItemCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of allCourseItems) {
      if (item.parentId) {
        map[item.parentId] = (map[item.parentId] || 0) + 1;
      }
    }
    return map;
  }, [allCourseItems]);

  // Breadcrumbs Navigation Trail
  const breadcrumbs = useMemo<BreadcrumbNode[]>(() => {
    const crumbs: BreadcrumbNode[] = [{ id: null, title: 'Root' }];
    for (const folder of folderHistory) {
      crumbs.push({ id: folder.id, title: folder.title });
    }
    if (currentFolder) {
      crumbs.push({ id: currentFolder.id, title: currentFolder.title });
    }
    return crumbs;
  }, [folderHistory, currentFolder]);

  // Navigate deeper into a folder
  const navigateIntoFolder = (folder: ContentItem) => {
    if (currentFolder) {
      setFolderHistory((prev) => [...prev, currentFolder]);
    }
    setCurrentFolder(folder);
  };

  // Navigate up one level
  const navigateUp = () => {
    if (folderHistory.length === 0) {
      setCurrentFolder(null);
    } else {
      const newHistory = [...folderHistory];
      const parent = newHistory.pop() || null;
      setFolderHistory(newHistory);
      setCurrentFolder(parent);
    }
  };

  // Jump to specific breadcrumb
  const navigateToBreadcrumb = (index: number) => {
    if (index === 0) {
      // Root
      setFolderHistory([]);
      setCurrentFolder(null);
    } else if (index <= folderHistory.length) {
      const target = folderHistory[index - 1];
      setFolderHistory(folderHistory.slice(0, index - 1));
      setCurrentFolder(target);
    }
  };

  // Filter items by search input
  const filteredItems = useMemo(() => {
    if (!filterQuery.trim()) return items;
    const q = filterQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
    );
  }, [items, filterQuery]);

  // Summary counts
  const summary = useMemo(() => {
    const folders = items.filter((i) => i.type === 'folder').length;
    const videos = items.filter((i) => i.type === 'video').length;
    const pdfs = items.filter((i) => i.type === 'pdf').length;
    const notes = items.filter((i) => i.type === 'note').length;
    return { total: items.length, folders, videos, pdfs, notes };
  }, [items]);

  // ==========================================
  // REORDERING
  // ==========================================
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    // Optimistically update local array
    const updated = [...items];
    const [movedItem] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, movedItem);

    // Reassign order indices
    const payload = updated.map((item, idx) => ({
      id: item.id,
      order: idx,
    }));

    setItems(
      updated.map((item, idx) => ({
        ...item,
        order: idx,
      }))
    );

    try {
      await apiFetch('/content/reorder', {
        method: 'PATCH',
        body: { items: payload },
      });
      toast('Item order updated', 'success');
    } catch (err: any) {
      console.error('[CourseContentManager] Reorder error:', err);
      toast('Failed to save new order', 'error');
      // Revert on error
      fetchContents(activeCourseId, currentFolder ? currentFolder.id : null);
    }
  };

  // ==========================================
  // MODAL STATES
  // ==========================================
  // Create Folder Modal
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderTitle, setFolderTitle] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Upload PDF / Video Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'pdf' | 'video'>('pdf');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Add Note Modal
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  // Rename Modal
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<ContentItem | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Replace File Modal
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [itemToReplace, setItemToReplace] = useState<ContentItem | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [isReplacing, setIsReplacing] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Delete Confirmation Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ContentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ==========================================
  // ACTION HANDLERS
  // ==========================================

  // 1. Create Folder Handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderTitle.trim() || !activeCourseId) return;

    setIsCreatingFolder(true);
    try {
      const res = await apiFetch<{ success: boolean; data: ContentItem }>('/content', {
        method: 'POST',
        body: {
          courseId: activeCourseId,
          parentId: currentFolder ? currentFolder.id : null,
          title: folderTitle.trim(),
          type: 'folder',
        },
      });

      if (res.success) {
        toast(`Folder "${folderTitle}" created!`, 'success');
        setFolderTitle('');
        setIsFolderModalOpen(false);
        fetchContents(activeCourseId, currentFolder ? currentFolder.id : null);
      }
    } catch (err: any) {
      toast(`Failed to create folder: ${err.message}`, 'error');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // 2. Open Upload Modal for PDF or Video
  const openUploadModal = (type: 'pdf' | 'video') => {
    setUploadType(type);
    setUploadFile(null);
    setUploadTitle('');
    setUploadProgress(0);
    setIsUploading(false);
    setIsUploadModalOpen(true);
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processSelectedUploadFile(file);
    }
  };

  const processSelectedUploadFile = (file: File) => {
    if (uploadType === 'pdf') {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast('Please upload a valid PDF file (.pdf)', 'error');
        return;
      }
    } else if (uploadType === 'video') {
      const isVideo =
        file.type.startsWith('video/') ||
        /\.(mp4|mov|mkv|webm)$/i.test(file.name);
      if (!isVideo) {
        toast('Please upload a valid video file (.mp4, .mov, .mkv, .webm)', 'error');
        return;
      }
    }

    setUploadFile(file);
    if (!uploadTitle.trim()) {
      // Auto-set title from clean file name
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setUploadTitle(cleanName);
    }
  };

  // 3. Execute Upload
  const handleExecuteUpload = async () => {
    if (!uploadFile || !uploadTitle.trim() || !activeCourseId) return;

    setIsUploading(true);
    setUploadProgress(0);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let finalMediaUrl = '';

      if (uploadType === 'video') {
        // Stream directly to Bunny Stream via tus resumable upload protocol
        const videoRes = await uploadTeacherVideo(
          uploadFile,
          { title: uploadTitle.trim() },
          (percent) => {
            setUploadProgress(percent);
          },
          abortController.signal
        );
        finalMediaUrl = videoRes.playerUrl;
      } else {
        // Step A: Request S3 Presigned URL for PDF
        const mimeType = (uploadFile.type || 'application/pdf').toLowerCase().trim().split(';')[0];
        const presigned = await getUploadPresignedUrl(
          uploadFile.name,
          mimeType,
          activeCourseId
        );

        // Step B: Stream Raw Binary to S3 with Progress & explicit Content-Type match
        await uploadFileWithProgress(
          presigned.uploadUrl,
          uploadFile,
          (percent) => {
            setUploadProgress(percent);
          },
          abortController.signal,
          mimeType
        );
        finalMediaUrl = presigned.fileUrl;
      }

      // Step C: Record asset in database via POST /api/content
      const postPayload = {
        courseId: activeCourseId,
        parentId: currentFolder ? currentFolder.id : null,
        title: uploadTitle.trim(),
        type: uploadType,
        mediaUrl: finalMediaUrl,
        fileSize: formatBytes(uploadFile.size),
      };

      console.log('[CourseContentManager] S3 upload finished, dispatching POST /api/content:', postPayload);

      let res: { success: boolean; data: ContentItem };
      try {
        res = await apiFetch<{ success: boolean; data: ContentItem }>('/content', {
          method: 'POST',
          body: postPayload,
        });
        console.log('[CourseContentManager] POST /api/content succeeded:', res);
      } catch (postErr: any) {
        console.error('[CourseContentManager] Failed to record uploaded content via POST /api/content:', {
          error: postErr,
          message: postErr.message,
          payload: postPayload,
        });
        toast(
          `S3 upload completed, but failed to record in database: ${postErr.message || 'Server error'}`,
          'error'
        );
        throw postErr;
      }

      if (res && res.success) {
        toast(`${uploadType.toUpperCase()} "${uploadTitle}" uploaded successfully!`, 'success');
        setIsUploadModalOpen(false);
        setUploadFile(null);
        setUploadTitle('');
        setUploadProgress(0);
        fetchContents(activeCourseId, currentFolder ? currentFolder.id : null);
      }
    } catch (err: any) {
      console.error('[CourseContentManager] Upload pipeline error:', err);
      if (err.message?.includes('aborted') || err.message?.includes('cancelled')) {
        toast('Upload cancelled', 'error');
      } else {
        toast(`Upload failed: ${err.message}`, 'error');
      }
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  };

  // 4. Create Note Handler
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !activeCourseId) return;

    setIsCreatingNote(true);
    try {
      const res = await apiFetch<{ success: boolean; data: ContentItem }>('/content', {
        method: 'POST',
        body: {
          courseId: activeCourseId,
          parentId: currentFolder ? currentFolder.id : null,
          title: noteTitle.trim(),
          type: 'note',
          mediaUrl: noteBody.trim() ? `data:text/plain;charset=utf-8,${encodeURIComponent(noteBody.trim())}` : null,
        },
      });

      if (res.success) {
        toast(`Note "${noteTitle}" added!`, 'success');
        setNoteTitle('');
        setNoteBody('');
        setIsNoteModalOpen(false);
        fetchContents(activeCourseId, currentFolder ? currentFolder.id : null);
      }
    } catch (err: any) {
      toast(`Failed to add note: ${err.message}`, 'error');
    } finally {
      setIsCreatingNote(false);
    }
  };

  // 5. Rename Item Handler
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToRename || !renameTitle.trim()) return;

    setIsRenaming(true);
    try {
      const res = await apiFetch<{ success: boolean; data: ContentItem }>(
        `/content/${itemToRename.id}`,
        {
          method: 'PATCH',
          body: { title: renameTitle.trim() },
        }
      );

      if (res.success) {
        toast('Item renamed successfully', 'success');
        setIsRenameModalOpen(false);
        setItemToRename(null);
        fetchContents(activeCourseId, currentFolder ? currentFolder.id : null);
      }
    } catch (err: any) {
      toast(`Failed to rename: ${err.message}`, 'error');
    } finally {
      setIsRenaming(false);
    }
  };

  // 6. Replace File Handler
  const handleExecuteReplace = async () => {
    if (!itemToReplace || !replaceFile || !activeCourseId) return;

    setIsReplacing(true);
    setReplaceProgress(0);

    try {
      let finalMediaUrl = '';

      if (itemToReplace.type === 'video') {
        const videoRes = await uploadTeacherVideo(
          replaceFile,
          { title: itemToReplace.title },
          (pct) => {
            setReplaceProgress(pct);
          }
        );
        finalMediaUrl = videoRes.playerUrl;
      } else {
        const mimeType =
          replaceFile.type ||
          (itemToReplace.type === 'pdf' ? 'application/pdf' : 'application/octet-stream');

        // Get presigned URL
        const presigned = await getUploadPresignedUrl(
          replaceFile.name,
          mimeType,
          activeCourseId
        );

        // Upload binary to S3 with explicit Content-Type match
        await uploadFileWithProgress(
          presigned.uploadUrl,
          replaceFile,
          (pct) => {
            setReplaceProgress(pct);
          },
          undefined,
          mimeType
        );
        finalMediaUrl = presigned.fileUrl;
      }

      // Update record via PATCH /api/content/:id
      const res = await apiFetch<{ success: boolean; data: ContentItem }>(
        `/content/${itemToReplace.id}`,
        {
          method: 'PATCH',
          body: {
            mediaUrl: finalMediaUrl,
            fileSize: formatBytes(replaceFile.size),
          },
        }
      );

      if (res.success) {
        toast(`File replaced for "${itemToReplace.title}"!`, 'success');
        setIsReplaceModalOpen(false);
        setItemToReplace(null);
        setReplaceFile(null);
        fetchContents(activeCourseId, currentFolder ? currentFolder.id : null);
      }
    } catch (err: any) {
      toast(`Failed to replace file: ${err.message}`, 'error');
    } finally {
      setIsReplacing(false);
    }
  };

  // 7. Delete Item Handler
  const handleExecuteDelete = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    try {
      const res = await apiFetch<{ success: boolean; deletedCount: number }>(
        `/content/${itemToDelete.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.success) {
        toast(`Deleted "${itemToDelete.title}"`, 'success');
        setIsDeleteModalOpen(false);
        setItemToDelete(null);
        fetchContents(activeCourseId, currentFolder ? currentFolder.id : null);
      }
    } catch (err: any) {
      toast(`Delete failed: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* 1. Header & Course Summary Bar */}
      <div className="glass-card" style={styles.headerCard}>
        <div style={styles.courseSelectRow}>
          <div>
            <span style={styles.kicker}>COURSE CONTENT MANAGEMENT</span>
            <h2 style={styles.courseTitle}>
              {currentCourse ? currentCourse.title.toUpperCase() : 'SELECT A COURSE'}
            </h2>
            {currentCourse && (
              <p style={styles.courseMeta}>
                {currentCourse.category} • {formatBytes(0)} • {summary.total} items in this folder
              </p>
            )}
          </div>

          <div style={styles.coursePickerBox}>
            <label style={styles.pickerLabel}>Switch Target Course:</label>
            <select
              value={activeCourseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              style={styles.courseSelect}
            >
              <option value="">-- Choose Course --</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} {course.isPublished ? '✓' : '(Draft)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Breadcrumb Navigation Trail */}
        {activeCourseId && (
          <div style={styles.breadcrumbsBar}>
            <div style={styles.breadcrumbsList}>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.id || 'root'}>
                    <button
                      onClick={() => navigateToBreadcrumb(idx)}
                      style={{
                        ...styles.crumbBtn,
                        color: isLast ? '#ffffff' : 'var(--text-secondary)',
                        fontWeight: isLast ? 700 : 500,
                      }}
                      title={`Jump to ${crumb.title}`}
                    >
                      {idx === 0 && <span style={{ marginRight: '6px' }}>🏠</span>}
                      {crumb.title}
                    </button>
                    {!isLast && <span style={styles.crumbDivider}>/</span>}
                  </React.Fragment>
                );
              })}
            </div>

            {currentFolder && (
              <button onClick={navigateUp} style={styles.backButton}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Up to Parent
              </button>
            )}
          </div>
        )}

        {/* Quick Action Toolbar */}
        {activeCourseId && (
          <div style={styles.toolbarRow}>
            <div style={styles.searchBox}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search items by title or type..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                style={styles.searchInput}
              />
              {filterQuery && (
                <button onClick={() => setFilterQuery('')} style={styles.clearSearchBtn}>
                  ×
                </button>
              )}
            </div>

            <div style={styles.actionButtonsGroup}>
              <button
                onClick={() => {
                  setFolderTitle('');
                  setIsFolderModalOpen(true);
                }}
                style={styles.btnSecondary}
              >
                <span style={{ fontSize: '1.1rem' }}>📁</span> + Create Folder
              </button>

              <button
                onClick={() => openUploadModal('pdf')}
                style={styles.btnPdf}
              >
                <span style={{ fontSize: '1.1rem' }}>📄</span> + Upload PDF
              </button>

              <button
                onClick={() => openUploadModal('video')}
                style={styles.btnVideo}
              >
                <span style={{ fontSize: '1.1rem' }}>🎥</span> + Upload Video
              </button>

              <button
                onClick={() => {
                  setNoteTitle('');
                  setNoteBody('');
                  setIsNoteModalOpen(true);
                }}
                style={styles.btnNote}
              >
                <span style={{ fontSize: '1.1rem' }}>📝</span> + Add Note
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Main Content Listing */}
      {!activeCourseId ? (
        <div className="glass-card" style={styles.emptyPromptCard}>
          <div style={styles.emptyPromptIcon}>📚</div>
          <h3 style={{ color: '#ffffff', marginBottom: '8px' }}>No Course Selected</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 1.5rem auto' }}>
            Please pick a course from the dropdown above to manage its lectures, folders, PDF notes, and learning materials.
          </p>
        </div>
      ) : loading ? (
        <div className="glass-card" style={styles.loadingCard}>
          <div style={styles.spinner} />
          <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>Loading course content...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="glass-card" style={styles.emptyFolderCard}>
          <div style={styles.emptyFolderIcon}>📭</div>
          <h3 style={{ color: '#ffffff', marginBottom: '8px' }}>
            {filterQuery ? 'No matching items found' : 'This folder is currently empty'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 1.5rem auto', fontSize: '0.95rem' }}>
            {filterQuery
              ? `No content matches "${filterQuery}". Clear the search query to view all items.`
              : 'Start structuring your course by adding subfolders, or upload PDFs and video lectures directly here.'}
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setIsFolderModalOpen(true)} style={styles.btnSecondary}>
              + Create Subfolder
            </button>
            <button onClick={() => openUploadModal('pdf')} style={styles.btnPdf}>
              + Upload PDF
            </button>
            <button onClick={() => openUploadModal('video')} style={styles.btnVideo}>
              + Upload Video
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.contentTableCard} className="glass-card">
          <div style={styles.tableHeaderRow}>
            <span style={{ flex: 1 }}>ITEM / TITLE</span>
            <span style={{ width: '130px', textAlign: 'center' }}>TYPE</span>
            <span style={{ width: '140px', textAlign: 'center' }}>SIZE / COUNT</span>
            <span style={{ width: '110px', textAlign: 'center' }}>ORDER</span>
            <span style={{ width: '160px', textAlign: 'right' }}>ACTIONS</span>
          </div>

          <div style={styles.itemsList}>
            {filteredItems.map((item, index) => {
              const isFirst = index === 0;
              const isLast = index === filteredItems.length - 1;
              const isFolder = item.type === 'folder';
              const childCount = isFolder ? folderItemCountMap[item.id] || 0 : null;

              return (
                <div
                  key={item.id}
                  style={styles.itemRow}
                  className="content-node-row"
                >
                  {/* Left: Icon & Title */}
                  <div
                    style={styles.itemTitleCell}
                    onClick={() => isFolder && navigateIntoFolder(item)}
                    title={isFolder ? 'Click to open folder' : item.title}
                  >
                    <div style={{ ...styles.typeBadge, ...getTypeBadgeStyle(item.type) }}>
                      {getTypeIcon(item.type)}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        style={{
                          ...styles.itemTitleText,
                          color: isFolder ? '#60a5fa' : '#ffffff',
                          cursor: isFolder ? 'pointer' : 'default',
                        }}
                      >
                        {item.title}
                      </span>
                      <span style={styles.itemSubtitle}>
                        {isFolder ? (
                          `${childCount} ${childCount === 1 ? 'item' : 'items'} inside`
                        ) : item.fileSize ? (
                          `File: ${item.fileSize}`
                        ) : item.mediaUrl ? (
                          <a
                            href={item.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.mediaLink}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open Link ↗
                          </a>
                        ) : (
                          'No file attached'
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Type Column */}
                  <div style={{ width: '130px', textAlign: 'center' }}>
                    <span style={{ ...styles.typeTag, ...getTypeTagStyle(item.type) }}>
                      {item.type.toUpperCase()}
                    </span>
                  </div>

                  {/* Size or Count Column */}
                  <div style={{ width: '140px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    {isFolder ? (
                      <span style={styles.folderCountBadge}>{childCount} items</span>
                    ) : (
                      item.fileSize || '—'
                    )}
                  </div>

                  {/* Reorder Buttons (Move Up / Down) */}
                  <div style={{ width: '110px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                    <button
                      onClick={() => handleMove(index, 'up')}
                      disabled={isFirst}
                      style={{
                        ...styles.reorderBtn,
                        opacity: isFirst ? 0.3 : 1,
                        cursor: isFirst ? 'not-allowed' : 'pointer',
                      }}
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMove(index, 'down')}
                      disabled={isLast}
                      style={{
                        ...styles.reorderBtn,
                        opacity: isLast ? 0.3 : 1,
                        cursor: isLast ? 'not-allowed' : 'pointer',
                      }}
                      title="Move Down"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Action Menu Buttons */}
                  <div style={{ width: '160px', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    {/* Rename */}
                    <button
                      onClick={() => {
                        setItemToRename(item);
                        setRenameTitle(item.title);
                        setIsRenameModalOpen(true);
                      }}
                      style={styles.actionIconBtn}
                      title="Rename Item"
                    >
                      ✎
                    </button>

                    {/* Replace File (PDF or Video) */}
                    {!isFolder && item.type !== 'note' && (
                      <button
                        onClick={() => {
                          setItemToReplace(item);
                          setReplaceFile(null);
                          setReplaceProgress(0);
                          setIsReplaceModalOpen(true);
                        }}
                        style={styles.actionIconBtn}
                        title="Replace File"
                      >
                        🔄
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => {
                        setItemToDelete(item);
                        setIsDeleteModalOpen(true);
                      }}
                      style={{ ...styles.actionIconBtn, color: '#f87171' }}
                      title="Delete Item"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODALS */}
      {/* ========================================================================= */}

      {/* A. Create Folder Modal */}
      {isFolderModalOpen && (
        <div style={styles.modalBackdrop} onClick={() => !isCreatingFolder && setIsFolderModalOpen(false)}>
          <div className="glass-card" style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Create New Folder</h3>
            <p style={styles.modalSubtitle}>
              Organize topics, test recordings, or chapter modules inside{' '}
              <strong>{currentFolder ? currentFolder.title : 'Root'}</strong>.
            </p>

            <form onSubmit={handleCreateFolder}>
              <div style={{ marginBottom: '1.2rem' }}>
                <label style={styles.inputLabel}>Folder Title</label>
                <input
                  type="text"
                  placeholder="e.g., Live Class Recordings, Chapter 1 Mechanics"
                  value={folderTitle}
                  onChange={(e) => setFolderTitle(e.target.value)}
                  style={styles.modalInput}
                  autoFocus
                  required
                />
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setIsFolderModalOpen(false)}
                  disabled={isCreatingFolder}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder || !folderTitle.trim()}
                  style={styles.btnSecondary}
                >
                  {isCreatingFolder ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* B. Upload PDF or Video Modal with Drag & Drop and Progress */}
      {isUploadModalOpen && (
        <div style={styles.modalBackdrop} onClick={() => !isUploading && setIsUploadModalOpen(false)}>
          <div className="glass-card" style={styles.modalBoxLarge} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <h3 style={styles.modalTitle}>
                Upload {uploadType === 'pdf' ? 'Document (PDF)' : 'Video Lecture'}
              </h3>
              <button
                onClick={() => !isUploading && setIsUploadModalOpen(false)}
                style={styles.closeBtn}
                disabled={isUploading}
              >
                ✕
              </button>
            </div>

            <p style={styles.modalSubtitle}>
              Uploading directly to {uploadType === 'video' ? 'Bunny.net Stream (Fast Resumable Upload)' : 'Amazon S3 storage'} under{' '}
              <strong>{currentFolder ? currentFolder.title : 'Root'}</strong>.
            </p>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              style={{
                ...styles.dropZone,
                borderColor: isDragOver ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.2)',
                backgroundColor: isDragOver ? 'rgba(255, 94, 94, 0.08)' : 'rgba(0, 0, 0, 0.25)',
                cursor: isUploading ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={uploadType === 'pdf' ? '.pdf,application/pdf' : '.mp4,.mov,.mkv,.webm,video/*'}
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processSelectedUploadFile(e.target.files[0]);
                  }
                }}
                disabled={isUploading}
              />

              <div style={styles.dropZoneIcon}>
                {uploadType === 'pdf' ? '📄' : '🎥'}
              </div>

              {uploadFile ? (
                <div>
                  <p style={{ color: '#ffffff', fontWeight: 600, fontSize: '1rem', wordBreak: 'break-all' }}>
                    {uploadFile.name}
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                    Size: {formatBytes(uploadFile.size)} • Type: {uploadFile.type || uploadType}
                  </p>
                  <span style={styles.changeFileNotice}>Click or drag to choose another file</span>
                </div>
              ) : (
                <div>
                  <p style={{ color: '#ffffff', fontWeight: 500, fontSize: '1rem' }}>
                    Drag & Drop your {uploadType === 'pdf' ? 'PDF' : 'Video'} file here
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px' }}>
                    or click to browse your local computer
                  </p>
                  <span style={styles.allowedFormats}>
                    {uploadType === 'pdf' ? 'Allowed: .pdf' : 'Allowed: .mp4, .mov, .mkv, .webm'}
                  </span>
                </div>
              )}
            </div>

            {/* Content Title Input */}
            <div style={{ marginTop: '1.2rem', marginBottom: '1.2rem' }}>
              <label style={styles.inputLabel}>Asset Display Title</label>
              <input
                type="text"
                placeholder={uploadType === 'pdf' ? 'e.g., Chapter 1 Formula Sheet' : 'e.g., Lecture 01 - Introduction'}
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                style={styles.modalInput}
                disabled={isUploading}
              />
            </div>

            {/* Progress Bar (when uploading) */}
            {isUploading && (
              <div style={styles.progressContainer}>
                <div style={styles.progressHeader}>
                  <span style={{ color: '#ffffff', fontSize: '0.88rem' }}>Uploading to S3...</span>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.88rem' }}>
                    {uploadProgress}%
                  </span>
                </div>
                <div style={styles.progressBarTrack}>
                  <div
                    style={{
                      ...styles.progressBarFill,
                      width: `${uploadProgress}%`,
                    }}
                  />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '6px' }}>
                  Please keep this browser window open until upload completes.
                </p>
              </div>
            )}

            {/* Modal Actions */}
            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                  }
                  setIsUploadModalOpen(false);
                }}
                disabled={isUploading && uploadProgress === 100}
                style={styles.modalCancelBtn}
              >
                {isUploading ? 'Cancel Upload' : 'Close'}
              </button>

              <button
                type="button"
                onClick={handleExecuteUpload}
                disabled={isUploading || !uploadFile || !uploadTitle.trim()}
                style={uploadType === 'pdf' ? styles.btnPdf : styles.btnVideo}
              >
                {isUploading ? `Uploading (${uploadProgress}%)...` : `Upload ${uploadType.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C. Add Note Modal */}
      {isNoteModalOpen && (
        <div style={styles.modalBackdrop} onClick={() => !isCreatingNote && setIsNoteModalOpen(false)}>
          <div className="glass-card" style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Quick Note / Announcement</h3>
            <p style={styles.modalSubtitle}>
              Create inline instructional notes or announcements for students.
            </p>

            <form onSubmit={handleCreateNote}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={styles.inputLabel}>Note Title</label>
                <input
                  type="text"
                  placeholder="e.g., Important Instructions for Exam"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  style={styles.modalInput}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.2rem' }}>
                <label style={styles.inputLabel}>Note Content (Optional)</label>
                <textarea
                  placeholder="Enter notes, links, or instructions..."
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  style={styles.modalTextarea}
                  rows={4}
                />
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  disabled={isCreatingNote}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingNote || !noteTitle.trim()}
                  style={styles.btnNote}
                >
                  {isCreatingNote ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* D. Rename Modal */}
      {isRenameModalOpen && itemToRename && (
        <div style={styles.modalBackdrop} onClick={() => !isRenaming && setIsRenameModalOpen(false)}>
          <div className="glass-card" style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Rename Item</h3>
            <p style={styles.modalSubtitle}>
              Update the display title for this {itemToRename.type}.
            </p>

            <form onSubmit={handleRenameSubmit}>
              <div style={{ marginBottom: '1.2rem' }}>
                <label style={styles.inputLabel}>New Title</label>
                <input
                  type="text"
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  style={styles.modalInput}
                  autoFocus
                  required
                />
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setIsRenameModalOpen(false)}
                  disabled={isRenaming}
                  style={styles.modalCancelBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRenaming || !renameTitle.trim()}
                  style={styles.btnSecondary}
                >
                  {isRenaming ? 'Saving...' : 'Update Title'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* E. Replace File Modal */}
      {isReplaceModalOpen && itemToReplace && (
        <div style={styles.modalBackdrop} onClick={() => !isReplacing && setIsReplaceModalOpen(false)}>
          <div className="glass-card" style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Replace File Asset</h3>
            <p style={styles.modalSubtitle}>
              Select a new file to replace the existing media for <strong>{itemToReplace.title}</strong>.
            </p>

            <div
              onClick={() => !isReplacing && replaceFileInputRef.current?.click()}
              style={{
                ...styles.dropZone,
                padding: '1.5rem',
                cursor: isReplacing ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                ref={replaceFileInputRef}
                type="file"
                accept={itemToReplace.type === 'pdf' ? '.pdf,application/pdf' : '.mp4,.mov,.mkv,.webm,video/*'}
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setReplaceFile(e.target.files[0]);
                  }
                }}
                disabled={isReplacing}
              />

              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>
                {itemToReplace.type === 'pdf' ? '📄' : '🎥'}
              </div>

              {replaceFile ? (
                <p style={{ color: '#ffffff', fontWeight: 600 }}>{replaceFile.name} ({formatBytes(replaceFile.size)})</p>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Click to select replacement {itemToReplace.type.toUpperCase()} file
                </p>
              )}
            </div>

            {isReplacing && (
              <div style={{ marginTop: '1rem' }}>
                <div style={styles.progressHeader}>
                  <span style={{ color: '#fff', fontSize: '0.85rem' }}>Uploading replacement...</span>
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{replaceProgress}%</span>
                </div>
                <div style={styles.progressBarTrack}>
                  <div style={{ ...styles.progressBarFill, width: `${replaceProgress}%` }} />
                </div>
              </div>
            )}

            <div style={{ ...styles.modalActions, marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setIsReplaceModalOpen(false)}
                disabled={isReplacing}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReplace}
                disabled={isReplacing || !replaceFile}
                style={styles.btnSecondary}
              >
                {isReplacing ? `Replacing (${replaceProgress}%)...` : 'Confirm Replacement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* F. Delete Confirmation Modal */}
      {isDeleteModalOpen && itemToDelete && (
        <div style={styles.modalBackdrop} onClick={() => !isDeleting && setIsDeleteModalOpen(false)}>
          <div className="glass-card" style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.deleteWarningIcon}>⚠️</div>
            <h3 style={{ ...styles.modalTitle, color: '#f87171' }}>Confirm Deletion</h3>
            
            <p style={{ color: '#cbd5e1', fontSize: '0.95rem', margin: '0.8rem 0 1.2rem 0', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete{' '}
              <strong>"{itemToDelete.title}"</strong> ({itemToDelete.type})?
            </p>

            {itemToDelete.type === 'folder' && (
              <div style={styles.cascadeWarningBox}>
                <p style={{ color: '#fca5a5', fontSize: '0.85rem', fontWeight: 500 }}>
                  🚨 <strong>CASCADE DELETE WARNING:</strong> All lectures, PDFs, notes, and subfolders nested inside this folder will also be permanently deleted!
                </p>
              </div>
            )}

            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                style={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                style={styles.btnDelete}
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// STYLES & BADGE HELPERS
// ==========================================

function getTypeIcon(type: ContentType) {
  switch (type) {
    case 'folder':
      return '📁';
    case 'video':
      return '▶';
    case 'pdf':
      return '📄';
    case 'note':
      return '📝';
    default:
      return '📎';
  }
}

function getTypeBadgeStyle(type: ContentType): React.CSSProperties {
  switch (type) {
    case 'folder':
      return { backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' };
    case 'video':
      return { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
    case 'pdf':
      return { backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' };
    case 'note':
      return { backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' };
    default:
      return { backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#ffffff' };
  }
}

function getTypeTagStyle(type: ContentType): React.CSSProperties {
  switch (type) {
    case 'folder':
      return { backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' };
    case 'video':
      return { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' };
    case 'pdf':
      return { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' };
    case 'note':
      return { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' };
    default:
      return { backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.2)' };
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    width: '100%',
  },
  headerCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.2rem',
  },
  courseSelectRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  kicker: {
    fontSize: '0.75rem',
    letterSpacing: '1px',
    color: 'var(--accent-primary)',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  courseTitle: {
    fontSize: '1.65rem',
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '-0.5px',
    margin: '4px 0',
  },
  courseMeta: {
    fontSize: '0.88rem',
    color: 'var(--text-secondary)',
  },
  coursePickerBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '260px',
  },
  pickerLabel: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  courseSelect: {
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'rgba(0, 0, 0, 0.35)',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    fontSize: '0.92rem',
    outline: 'none',
  },
  breadcrumbsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    flexWrap: 'wrap',
    gap: '8px',
  },
  breadcrumbsList: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px',
  },
  crumbBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.92rem',
    padding: '4px 6px',
    borderRadius: '4px',
    transition: 'all 0.15s ease',
  },
  crumbDivider: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '0.9rem',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontWeight: 500,
  },
  toolbarRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    padding: '8px 14px',
    flex: '1 1 260px',
    maxWidth: '380px',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '0.9rem',
    width: '100%',
    outline: 'none',
  },
  clearSearchBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: '0 4px',
  },
  actionButtonsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  btnSecondary: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    padding: '9px 16px',
    borderRadius: '8px',
    fontSize: '0.88rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'opacity 0.2s',
  },
  btnPdf: {
    backgroundColor: '#f59e0b',
    color: '#ffffff',
    border: 'none',
    padding: '9px 16px',
    borderRadius: '8px',
    fontSize: '0.88rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  btnVideo: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    padding: '9px 16px',
    borderRadius: '8px',
    fontSize: '0.88rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  btnNote: {
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    padding: '9px 16px',
    borderRadius: '8px',
    fontSize: '0.88rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  emptyPromptCard: {
    textAlign: 'center',
    padding: '4rem 2rem',
  },
  emptyPromptIcon: {
    fontSize: '3.5rem',
    marginBottom: '1rem',
  },
  loadingCard: {
    textAlign: 'center',
    padding: '3rem 2rem',
  },
  spinner: {
    width: '40px',
    height: '40px',
    margin: '0 auto',
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: 'var(--accent-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  emptyFolderCard: {
    textAlign: 'center',
    padding: '3.5rem 2rem',
  },
  emptyFolderIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  contentTableCard: {
    padding: '0',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 20px',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.8px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
  },
  itemsList: {
    display: 'flex',
    flexDirection: 'column',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    transition: 'background-color 0.15s ease',
  },
  itemTitleCell: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    overflow: 'hidden',
  },
  typeBadge: {
    width: '38px',
    height: '38px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '1.2rem',
    flexShrink: 0,
  },
  itemTitleText: {
    fontSize: '0.98rem',
    fontWeight: 600,
    letterSpacing: '-0.2px',
    marginBottom: '2px',
    textDecoration: 'none',
  },
  itemSubtitle: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
  },
  mediaLink: {
    color: '#38bdf8',
    textDecoration: 'none',
    fontSize: '0.8rem',
  },
  typeTag: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  folderCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  reorderBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '0.75rem',
  },
  actionIconBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  modalBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    padding: '1.5rem',
  },
  modalBox: {
    width: '100%',
    maxWidth: '460px',
    padding: '2rem',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
  },
  modalBoxLarge: {
    width: '100%',
    maxWidth: '560px',
    padding: '2rem',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
  },
  modalTitle: {
    fontSize: '1.35rem',
    fontWeight: 700,
    color: '#ffffff',
  },
  modalSubtitle: {
    fontSize: '0.88rem',
    color: 'var(--text-secondary)',
    marginBottom: '1.5rem',
    lineHeight: 1.5,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '1.3rem',
    cursor: 'pointer',
  },
  dropZone: {
    border: '2px dashed rgba(255, 255, 255, 0.2)',
    borderRadius: '12px',
    padding: '2rem 1.5rem',
    textAlign: 'center',
    transition: 'all 0.2s ease',
  },
  dropZoneIcon: {
    fontSize: '2.5rem',
    marginBottom: '10px',
  },
  changeFileNotice: {
    display: 'inline-block',
    marginTop: '8px',
    fontSize: '0.8rem',
    color: 'var(--accent-primary)',
    textDecoration: 'underline',
  },
  allowedFormats: {
    display: 'inline-block',
    marginTop: '6px',
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    opacity: 0.8,
  },
  inputLabel: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  modalInput: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#ffffff',
    fontSize: '0.95rem',
    outline: 'none',
  },
  modalTextarea: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#ffffff',
    fontSize: '0.95rem',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  progressContainer: {
    marginTop: '1.2rem',
    padding: '12px',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  progressBarTrack: {
    width: '100%',
    height: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: 'var(--accent-primary)',
    borderRadius: '4px',
    transition: 'width 0.2s ease',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '1.2rem',
  },
  modalCancelBtn: {
    padding: '10px 18px',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#ffffff',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnDelete: {
    padding: '10px 18px',
    backgroundColor: '#ef4444',
    border: 'none',
    color: '#ffffff',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  deleteWarningIcon: {
    fontSize: '2.5rem',
    textAlign: 'center',
    marginBottom: '0.5rem',
  },
  cascadeWarningBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '1rem',
  },
};
