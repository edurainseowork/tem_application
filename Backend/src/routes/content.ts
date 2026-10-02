import { Router, type Request } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@workspace/db";
import { userCoursesTable, coursesTable, usersTable, courseContentTable } from "@workspace/db/schema";
import { eq, and, asc, inArray, sql, isNull } from "drizzle-orm";
import {
  isAdmin,
  isAdminOrFaculty,
  requireAdmin,
  requireAdminOrFaculty,
  optionalAuth,
  verifyCourseEntitlement,
} from "../middleware/auth";
import { HttpError, parseId } from "../lib/http-error";
import { deleteLocalUpload, toPublicUrl } from "../lib/media";
import { logger } from "../lib/logger";

const router = Router();

export function formatContentItem(item: typeof courseContentTable.$inferSelect, req?: Request) {
  const rawMedia = item.mediaUrl ?? null;
  const publicUrl = rawMedia && req ? toPublicUrl(rawMedia, req) : rawMedia;
  return {
    id: String(item.id),
    course_id: String(item.courseId),
    courseId: item.courseId,
    parent_id: item.parentId ? String(item.parentId) : null,
    parentId: item.parentId ? String(item.parentId) : null,
    title: item.title,
    type: item.type,
    media_url: publicUrl,
    mediaUrl: publicUrl,
    url: publicUrl, // backward compatibility for app/cms
    file_size: item.fileSize ?? null,
    fileSize: item.fileSize ?? null,
    order: item.order ?? 0,
    created_at: item.createdAt,
    createdAt: item.createdAt,
    updated_at: item.updatedAt ?? item.createdAt,
    updatedAt: item.updatedAt ?? item.createdAt,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetches course content hierarchy (Section 11):
 * - If parentId is omitted, null, or "null", returns root folders and files.
 * - If parentId is provided and a valid folder UUID, returns contents inside that specific folder.
 * - Results are sorted ascending by the order column.
 */
export async function fetchCourseContentTree(
  courseId: number,
  parentIdOption: string | null | undefined,
  req: Request,
) {
  const [course] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));

  if (!course) throw new HttpError(404, "Course not found");

  const auth = req.auth;
  if (auth && !isAdminOrFaculty(auth, req.user)) {
    const isEntitled = await verifyCourseEntitlement(auth.uid, courseId);
    if (!isEntitled) {
      throw new HttpError(403, "Course not purchased");
    }
  }

  let filterCondition = eq(courseContentTable.courseId, courseId);

  const cleanParentId =
    typeof parentIdOption === "string" ? parentIdOption.trim() : parentIdOption;

  // If parentId is omitted, null, "null", "undefined", or empty, return root items
  if (
    cleanParentId === undefined ||
    cleanParentId === null ||
    cleanParentId === "" ||
    cleanParentId === "null" ||
    cleanParentId === "undefined" ||
    cleanParentId === "root" ||
    cleanParentId === "none"
  ) {
    filterCondition = and(filterCondition, isNull(courseContentTable.parentId))!;
  } else if (cleanParentId === "all") {
    // Return all items if explicitly requested with parentId=all
  } else if (UUID_REGEX.test(cleanParentId)) {
    // Return contents inside that specific folder
    filterCondition = and(filterCondition, eq(courseContentTable.parentId, cleanParentId))!;
  } else {
    // Default to root items for non-UUID strings to prevent Postgres UUID syntax errors
    filterCondition = and(filterCondition, isNull(courseContentTable.parentId))!;
  }

  const content = await db
    .select()
    .from(courseContentTable)
    .where(filterCondition)
    .orderBy(
      asc(courseContentTable.order),
      asc(courseContentTable.createdAt),
      asc(courseContentTable.id),
    );

  const items = content.map((item) => formatContentItem(item, req));
  const courseIdParam = req.params?.id ?? req.params?.courseId ?? String(courseId);
  console.log(`[BACKEND CONTENT FETCH] Course: ${courseIdParam}, ParentId: ${req.query?.parentId}, Found Rows: ${items.length}`);
  return items;
}

const createContentSchema = z.object({
  course_id: z.union([z.string(), z.number()]).transform((v) => parseId(v)).optional(),
  courseId: z.union([z.string(), z.number()]).transform((v) => parseId(v)).optional(),
  parent_id: z.union([z.string(), z.number()]).transform((v) => String(v)).nullable().optional(),
  parentId: z.union([z.string(), z.number()]).transform((v) => String(v)).nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(255),
  type: z.enum(["folder", "video", "pdf", "note", "quiz"]),
  media_url: z.string().trim().nullable().optional(),
  mediaUrl: z.string().trim().nullable().optional(),
  url: z.string().trim().nullable().optional(),
  file_size: z.string().trim().nullable().optional(),
  fileSize: z.string().trim().nullable().optional(),
  order: z.coerce.number().int().optional(),
});

const updateContentSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  type: z.enum(["folder", "video", "pdf", "note", "quiz"]).optional(),
  media_url: z.string().trim().nullable().optional(),
  mediaUrl: z.string().trim().nullable().optional(),
  url: z.string().trim().nullable().optional(),
  file_size: z.string().trim().nullable().optional(),
  fileSize: z.string().trim().nullable().optional(),
  parent_id: z.union([z.string(), z.number()]).transform((v) => String(v)).nullable().optional(),
  parentId: z.union([z.string(), z.number()]).transform((v) => String(v)).nullable().optional(),
  order: z.coerce.number().int().optional(),
});

const reorderItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  order: z.coerce.number().int(),
});

const reorderSchema = z.union([
  z.object({
    items: z.array(reorderItemSchema),
  }).transform((v) => v.items),
  z.array(reorderItemSchema),
  z.object({
    orders: z.array(reorderItemSchema),
  }).transform((v) => v.orders),
]);

// Helper for creating content node
async function handleCreateContent(req: Request, paramCourseId?: number) {
  const input = createContentSchema.parse(req.body);
  const courseId = paramCourseId ?? input.course_id ?? input.courseId;

  if (!courseId) {
    throw new HttpError(400, "courseId is required");
  }

  const [course] = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  if (!course) throw new HttpError(404, "Course not found");

  const rawParentId = input.parentId !== undefined ? input.parentId : input.parent_id ?? null;
  const parentId = rawParentId && rawParentId !== "null" && rawParentId !== "" ? rawParentId : null;

  if (parentId) {
    const [parent] = await db
      .select({ id: courseContentTable.id, type: courseContentTable.type })
      .from(courseContentTable)
      .where(
        and(
          eq(courseContentTable.id, parentId),
          eq(courseContentTable.courseId, courseId),
        ),
      );
    if (!parent) throw new HttpError(400, "Parent folder does not exist in this course");
    if (parent.type !== "folder") throw new HttpError(400, "Parent item must be a folder");
  }

  const rawMedia =
    input.mediaUrl !== undefined
      ? input.mediaUrl
      : input.media_url !== undefined
      ? input.media_url
      : input.url ?? null;

  const rawFileSize =
    input.fileSize !== undefined
      ? input.fileSize
      : input.file_size !== undefined
      ? input.file_size
      : null;

  // If order is not supplied, automatically assign MAX(order) + 1 for that parent level
  let itemOrder = input.order;
  if (itemOrder === undefined) {
    const parentCondition = parentId
      ? eq(courseContentTable.parentId, parentId)
      : isNull(courseContentTable.parentId);

    const [maxOrderRow] = await db
      .select({
        maxOrder: sql<number>`COALESCE(MAX(${courseContentTable.order}), -1)`,
      })
      .from(courseContentTable)
      .where(and(eq(courseContentTable.courseId, courseId), parentCondition));

    const currentMax = Number(maxOrderRow?.maxOrder ?? -1);
    itemOrder = currentMax + 1;
  }

  const [newContent] = await db
    .insert(courseContentTable)
    .values({
      id: crypto.randomUUID(),
      courseId,
      parentId: parentId ?? null,
      type: input.type,
      title: input.title,
      mediaUrl: input.type === "folder" ? null : rawMedia,
      fileSize: rawFileSize,
      order: itemOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  logger.info({ adminUid: req.auth?.uid, courseId, contentId: newContent.id, order: itemOrder }, "Course content created");
  return formatContentItem(newContent, req);
}

// POST /api/content — Create a new item (admin or faculty only)
router.post("/", requireAdminOrFaculty, async (req, res) => {
  const data = await handleCreateContent(req);
  res.status(201).json({ success: true, data });
});

// POST /api/content/:courseId — Backward compatibility for CMS-Portal (admin or faculty only)
router.post("/:courseId", requireAdminOrFaculty, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const data = await handleCreateContent(req, courseId);
  res.status(201).json({ success: true, data });
});

// PATCH /api/content/reorder — Transactionally update items' order positions (admin or faculty only)
router.patch("/reorder", requireAdminOrFaculty, async (req, res) => {
  const items = reorderSchema.parse(req.body);
  if (items.length === 0) {
    res.json({ success: true, message: "No items to reorder", count: 0 });
    return;
  }

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .update(courseContentTable)
        .set({
          order: item.order,
          updatedAt: new Date(),
        })
        .where(eq(courseContentTable.id, item.id));
    }
  });

  logger.info({ adminUid: req.auth?.uid, count: items.length }, "Course content items reordered");
  res.json({ success: true, message: "Items reordered successfully", count: items.length });
});

// PATCH /api/content/:id — Update fields like title, mediaUrl, or fileSize (admin or faculty only)
router.patch("/:id", requireAdminOrFaculty, async (req, res) => {
  const id = String(req.params.id);
  const input = updateContentSchema.parse(req.body);

  const [existing] = await db
    .select()
    .from(courseContentTable)
    .where(eq(courseContentTable.id, id));

  if (!existing) {
    throw new HttpError(404, "Content item not found");
  }

  const rawParentId = input.parentId !== undefined ? input.parentId : input.parent_id;
  const parentId = rawParentId && rawParentId !== "null" && rawParentId !== "" ? rawParentId : rawParentId === null ? null : undefined;

  if (parentId !== undefined && parentId !== null) {
    if (parentId === id) {
      throw new HttpError(400, "Item cannot be its own parent");
    }
    const [parent] = await db
      .select({ id: courseContentTable.id, type: courseContentTable.type })
      .from(courseContentTable)
      .where(
        and(
          eq(courseContentTable.id, parentId),
          eq(courseContentTable.courseId, existing.courseId),
        ),
      );
    if (!parent) {
      throw new HttpError(400, "Parent folder does not exist in this course");
    }
    if (parent.type !== "folder") {
      throw new HttpError(400, "Parent item must be a folder");
    }
  }

  const updates: Partial<typeof courseContentTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) updates.title = input.title;
  if (input.type !== undefined) updates.type = input.type;

  const rawMedia =
    input.mediaUrl !== undefined
      ? input.mediaUrl
      : input.media_url !== undefined
      ? input.media_url
      : input.url;
  if (rawMedia !== undefined) {
    updates.mediaUrl = rawMedia;
  }

  const rawFileSize =
    input.fileSize !== undefined
      ? input.fileSize
      : input.file_size !== undefined
      ? input.file_size
      : undefined;
  if (rawFileSize !== undefined) {
    updates.fileSize = rawFileSize;
  }

  if (parentId !== undefined) {
    updates.parentId = parentId;
  }

  if (input.order !== undefined) {
    updates.order = input.order;
  }

  const [updated] = await db
    .update(courseContentTable)
    .set(updates)
    .where(eq(courseContentTable.id, id))
    .returning();

  logger.info({ adminUid: req.auth?.uid, id, updates }, "Course content item updated");
  res.json({ success: true, data: formatContentItem(updated, req) });
});

// DELETE /api/content/:id — Cascade delete target node and all nested descendants (admin or faculty only)
router.delete("/:id", requireAdminOrFaculty, async (req, res) => {
  const id = String(req.params.id);

  const result = await db.execute<{ id: string; media_url: string | null }>(sql`
    with recursive tree as (
      select id, media_url from ${courseContentTable} where id = ${id}
      union all
      select c.id, c.media_url from ${courseContentTable} c join tree t on c.parent_id = t.id
    )
    select id, media_url from tree
  `);

  const rows = result.rows;
  if (rows.length === 0) {
    throw new HttpError(404, "Content not found");
  }

  const ids = rows.map((r) => String(r.id));

  // Best-effort cleanup of locally uploaded media for deleted nodes
  for (const row of rows) {
    if (row.media_url) {
      await deleteLocalUpload(row.media_url);
    }
  }

  await db.delete(courseContentTable).where(inArray(courseContentTable.id, ids));

  logger.info({ adminUid: req.auth?.uid, contentIds: ids }, "Course content cascade deleted");
  res.json({ success: true, deletedCount: ids.length, deletedIds: ids });
});

// GET /api/content/:courseId — Get course content hierarchy
router.get("/:courseId", optionalAuth, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const rawParentId = req.query.parentId !== undefined ? req.query.parentId : req.query.parent_id;
  const parentId = rawParentId !== undefined && rawParentId !== null ? String(rawParentId) : undefined;
  const items = await fetchCourseContentTree(courseId, parentId, req);
  res.json({ success: true, data: items, content: items });
});

// GET /api/content — Get course content by query param (courseId)
router.get("/", optionalAuth, async (req, res) => {
  const rawCourseId = req.query.courseId ?? req.query.course_id;
  if (!rawCourseId) {
    res.status(400).json({ error: "courseId is required" });
    return;
  }
  const courseId = parseId(rawCourseId);
  const rawParentId = req.query.parentId !== undefined ? req.query.parentId : req.query.parent_id;
  const parentId = rawParentId !== undefined && rawParentId !== null ? String(rawParentId) : undefined;
  const items = await fetchCourseContentTree(courseId, parentId, req);
  res.json({ success: true, data: items, content: items });
});

export default router;
