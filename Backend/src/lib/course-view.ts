import type { Request } from "express";
import { sql } from "drizzle-orm";
import { categoriesTable, coursesTable } from "@workspace/db/schema";
import { toPublicUrl } from "./media";

// Explicit column list: protected fields (vimeoId, pdfUrl) are never selected for the catalog.
export const publicCourseColumns = {
  id: coursesTable.id,
  title: coursesTable.title,
  description: coursesTable.description,
  price: coursesTable.price,
  originalPrice: coursesTable.originalPrice,
  thumbnail: coursesTable.thumbnail,
  category: coursesTable.category,
  categoryId: coursesTable.categoryId,
  categorySlug: categoriesTable.slug,
};

export const adminCourseColumns = {
  ...publicCourseColumns,
  isPublished: coursesTable.isPublished,
  publishedAt: coursesTable.publishedAt,
  createdAt: coursesTable.createdAt,
  updatedAt: coursesTable.updatedAt,
  // Table names are written out: drizzle renders bare column names inside sql``, which would
  // bind to the subquery's own table.
  enrollmentCount: sql<number>`(select count(*) from "user_courses" uc where uc."course_id" = "courses"."id")`.mapWith(Number),
};

export function withPublicThumbnail<T extends { thumbnail: string }>(course: T, req: Request): T {
  return { ...course, thumbnail: toPublicUrl(course.thumbnail, req) };
}
