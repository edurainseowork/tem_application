export type ContentType = 'folder' | 'video' | 'pdf' | 'note' | 'quiz';

export interface ContentItem {
  id: string;
  courseId: string | number;
  course_id?: string;
  parentId: string | null;
  parent_id?: string | null;
  title: string;
  type: ContentType;
  mediaUrl: string | null;
  media_url?: string | null;
  url?: string | null;
  fileSize: string | null;
  file_size?: string | null;
  order: number;
  createdAt?: string | Date;
  created_at?: string | Date;
  updatedAt?: string | Date;
  updated_at?: string | Date;
}

export interface CreateContentNodeInput {
  courseId: string;
  parentId?: string | null;
  title: string;
  type: ContentType;
  mediaUrl?: string;
  fileSize?: string;
  order?: number;
}

export interface UpdateContentNodeInput {
  title?: string;
  type?: ContentType;
  mediaUrl?: string | null;
  fileSize?: string | null;
  parentId?: string | null;
  order?: number;
}

export interface ReorderContentItemInput {
  id: string;
  order: number;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  key: string;
  fileUrl: string;
}
