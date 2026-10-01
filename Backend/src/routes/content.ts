import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { userCoursesTable, coursesTable, usersTable, courseContentTable } from "@workspace/db/schema";
import { eq, and, asc, inArray, sql } from "drizzle-orm";
import { isAdmin, requireAdmin, requireAuth } from "../middlewares/auth";
import { HttpError, parseId } from "../lib/http-error";
import { isLocalUploadPath, toPublicUrl } from "../lib/media";
import { logger } from "../lib/logger";

const router = Router();

const httpsUrl = z.string().trim().max(2048).url().refine((v) => v.startsWith("https://"), "URL must use https");

const createContentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("folder"),
    title: z.string().trim().min(1).max(200),
    parentId: z.coerce.number().int().positive().nullish(),
    url: z.null().optional().or(z.literal("")),
  }),
  z.object({
    type: z.literal("pdf"),
    title: z.string().trim().min(1).max(200),
    parentId: z.coerce.number().int().positive().nullish(),
    url: z
      .string()
      .trim()
      .refine((v) => (isLocalUploadPath(v) && v.endsWith(".pdf")) || httpsUrl.safeParse(v).success, "Invalid PDF URL"),
  }),
  z.object({
    type: z.literal("video"),
    title: z.string().trim().min(1).max(200),
    parentId: z.coerce.number().int().positive().nullish(),
    url: httpsUrl,
  }),
]);

// GET /api/content/:courseId — purchased students and admins only.
// The caller is identified by their Firebase ID token, never by a uid/admin query parameter.
router.get("/:courseId", requireAuth, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const auth = req.auth!;

  if (!isAdmin(auth)) {
    const purchased = await db
      .select({ id: userCoursesTable.id })
      .from(userCoursesTable)
      .innerJoin(usersTable, eq(userCoursesTable.userId, usersTable.id))
      .where(and(eq(usersTable.firebaseUid, auth.uid), eq(userCoursesTable.courseId, courseId)))
      .limit(1);

    if (purchased.length === 0) {
      throw new HttpError(403, "Course not purchased");
    }
  }

  const content = await db
    .select()
    .from(courseContentTable)
    .where(eq(courseContentTable.courseId, courseId))
    .orderBy(asc(courseContentTable.createdAt), asc(courseContentTable.id));

  res.json({
    success: true,
    data: content.map((item) => ({ ...item, url: item.url ? toPublicUrl(item.url, req) : null })),
  });
});

// POST /api/content/:courseId — create folder / pdf / video (admin only)
router.post("/:courseId", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId);
  const input = createContentSchema.parse(req.body);

  const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, courseId));
  if (!course) throw new HttpError(404, "Course not found");

  if (input.parentId) {
    const [parent] = await db
      .select({ id: courseContentTable.id })
      .from(courseContentTable)
      .where(
        and(
          eq(courseContentTable.id, input.parentId),
          eq(courseContentTable.courseId, courseId),
          eq(courseContentTable.type, "folder"),
        ),
      );
    if (!parent) throw new HttpError(400, "Parent folder does not exist in this course");
  }

  const [newContent] = await db
    .insert(courseContentTable)
    .values({
      courseId,
      parentId: input.parentId ?? null,
      type: input.type,
      title: input.title,
      url: input.type === "folder" ? null : input.url,
    })
    .returning();

  logger.info({ adminUid: req.auth?.uid, courseId, contentId: newContent.id }, "Course content created");
  res.status(201).json({ success: true, data: newContent });
});

// DELETE /api/content/:id — deletes the item and, for folders, everything inside it (admin only)
router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);

  const result = await db.execute<{ id: number }>(sql`
    with recursive tree as (
      select id from ${courseContentTable} where id = ${id}
      union all
      select c.id from ${courseContentTable} c join tree t on c.parent_id = t.id
    )
    select id from tree
  `);
  const ids = result.rows.map((r) => Number(r.id));
  if (ids.length === 0) throw new HttpError(404, "Content not found");

  await db.delete(courseContentTable).where(inArray(courseContentTable.id, ids));

  logger.info({ adminUid: req.auth?.uid, contentIds: ids }, "Course content deleted");
  res.json({ success: true });
});

export default router;
