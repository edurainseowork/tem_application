import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, coursesTable, userCoursesTable } from "@workspace/db/schema";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { adminCourseColumns, withPublicThumbnail } from "../../lib/course-view";
import {
  adminCourseQuerySchema,
  createCourseSchema,
  publishSchema,
  updateCourseSchema,
} from "../../lib/course-schemas";
import { HttpError, parseId } from "../../lib/http-error";
import { deleteLocalUpload } from "../../lib/media";
import { logger } from "../../lib/logger";

// Mounted behind requireAdmin in routes/admin/index.ts.
const router = Router();

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function loadCourse(courseId: number) {
  const [course] = await db
    .select(adminCourseColumns)
    .from(coursesTable)
    .leftJoin(categoriesTable, eq(coursesTable.categoryId, categoriesTable.id))
    .where(eq(coursesTable.id, courseId));
  if (!course) throw new HttpError(404, "Course not found");
  return course;
}

async function requireCategory(executor: Db | Tx, categoryId: number) {
  const [category] = await executor
    .select({ id: categoriesTable.id, name: categoriesTable.name })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, categoryId));
  if (!category) throw new HttpError(400, "Category does not exist");
  return category;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// GET /api/admin/courses?status=all|published|draft&categoryId=&q=
router.get("/", async (req, res) => {
  const { status, categoryId, q } = adminCourseQuerySchema.parse(req.query);

  const filters: (SQL | undefined)[] = [];
  if (status === "published") filters.push(eq(coursesTable.isPublished, true));
  if (status === "draft") filters.push(eq(coursesTable.isPublished, false));
  if (categoryId) filters.push(eq(coursesTable.categoryId, categoryId));
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    filters.push(or(ilike(coursesTable.title, pattern), ilike(coursesTable.description, pattern)));
  }

  const courses = await db
    .select(adminCourseColumns)
    .from(coursesTable)
    .leftJoin(categoriesTable, eq(coursesTable.categoryId, categoriesTable.id))
    .where(and(...filters))
    .orderBy(desc(coursesTable.updatedAt), desc(coursesTable.id));

  res.json({ success: true, data: courses.map((c) => withPublicThumbnail(c, req)) });
});

// GET /api/admin/courses/:id
router.get("/:id", async (req, res) => {
  const course = await loadCourse(parseId(req.params.id));
  res.json({ success: true, data: withPublicThumbnail(course, req) });
});

// POST /api/admin/courses
router.post("/", async (req, res) => {
  const input = createCourseSchema.parse(req.body);
  const category = await requireCategory(db, input.categoryId);
  const now = new Date();

  const [created] = await db
    .insert(coursesTable)
    .values({
      title: input.title,
      description: input.description,
      price: input.price,
      originalPrice: input.originalPrice ?? null,
      thumbnail: input.thumbnail,
      categoryId: category.id,
      category: category.name,
      isPublished: input.isPublished,
      publishedAt: input.isPublished ? now : null,
            mentorName: input.mentorName ?? null,
      mentorExperience: input.mentorExperience ?? null,
      mentorPhoto: input.mentorPhoto ?? null,
      studentsEnrolled: input.studentsEnrolled ?? null,
      duration: input.duration ?? null,
      totalLessons: input.totalLessons ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: coursesTable.id });

  logger.info({ adminUid: req.auth?.uid, courseId: created.id }, "Course created");
  const course = await loadCourse(created.id);
  res.status(201).json({ success: true, data: withPublicThumbnail(course, req) });
});

// PATCH /api/admin/courses/:id  (partial update)
router.patch("/:id", async (req, res) => {
  const courseId = parseId(req.params.id);
  const input = updateCourseSchema.parse(req.body);

  const previousThumbnail = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        price: coursesTable.price,
        originalPrice: coursesTable.originalPrice,
        thumbnail: coursesTable.thumbnail,
        isPublished: coursesTable.isPublished,
      })
      .from(coursesTable)
      .where(eq(coursesTable.id, courseId))
      .for("update");
    if (!existing) throw new HttpError(404, "Course not found");

    const price = input.price ?? existing.price;
    const originalPrice = input.originalPrice !== undefined ? input.originalPrice : existing.originalPrice;
    if (originalPrice != null && originalPrice < price) {
      throw new HttpError(400, "Original price must be greater than or equal to the selling price");
    }

    const patch: Partial<typeof coursesTable.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.price !== undefined) patch.price = input.price;
    if (input.originalPrice !== undefined) patch.originalPrice = input.originalPrice;
    if (input.thumbnail !== undefined) patch.thumbnail = input.thumbnail;
        if (input.mentorName !== undefined) patch.mentorName = input.mentorName;
    if (input.mentorExperience !== undefined) patch.mentorExperience = input.mentorExperience;
    if (input.mentorPhoto !== undefined) patch.mentorPhoto = input.mentorPhoto;
    if (input.studentsEnrolled !== undefined) patch.studentsEnrolled = input.studentsEnrolled;
    if (input.duration !== undefined) patch.duration = input.duration;
    if (input.totalLessons !== undefined) patch.totalLessons = input.totalLessons;
    if (input.categoryId !== undefined) {
      const category = await requireCategory(tx, input.categoryId);
      patch.categoryId = category.id;
      patch.category = category.name;
    }
    if (input.isPublished !== undefined) {
      patch.isPublished = input.isPublished;
      if (input.isPublished && !existing.isPublished) patch.publishedAt = new Date();
    }

    await tx.update(coursesTable).set(patch).where(eq(coursesTable.id, courseId));
    return input.thumbnail !== undefined && input.thumbnail !== existing.thumbnail ? existing.thumbnail : null;
  });

  await deleteUnreferencedThumbnail(previousThumbnail);
  logger.info({ adminUid: req.auth?.uid, courseId, fields: Object.keys(input) }, "Course updated");
  const course = await loadCourse(courseId);
  res.json({ success: true, data: withPublicThumbnail(course, req) });
});

// PATCH /api/admin/courses/:id/publish  { isPublished: boolean }
router.patch("/:id/publish", async (req, res) => {
  const courseId = parseId(req.params.id);
  const { isPublished } = publishSchema.parse(req.body);

  const [existing] = await db
    .select({ isPublished: coursesTable.isPublished })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  if (!existing) throw new HttpError(404, "Course not found");

  if (existing.isPublished !== isPublished) {
    await db
      .update(coursesTable)
      .set({
        isPublished,
        updatedAt: new Date(),
        ...(isPublished ? { publishedAt: new Date() } : {}),
      })
      .where(eq(coursesTable.id, courseId));
    logger.info({ adminUid: req.auth?.uid, courseId, isPublished }, "Course publish state changed");
  }

  const course = await loadCourse(courseId);
  res.json({ success: true, data: withPublicThumbnail(course, req) });
});

// DELETE /api/admin/courses/:id
router.delete("/:id", async (req, res) => {
  const courseId = parseId(req.params.id);

  const thumbnail = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ thumbnail: coursesTable.thumbnail })
      .from(coursesTable)
      .where(eq(coursesTable.id, courseId))
      .for("update");
    if (!existing) throw new HttpError(404, "Course not found");

    // Purchase records are payment history — never delete them to make a course removable.
    const [{ enrollments }] = await tx
      .select({ enrollments: count() })
      .from(userCoursesTable)
      .where(eq(userCoursesTable.courseId, courseId));
    if (enrollments > 0) {
      throw new HttpError(
        409,
        `This course has ${enrollments} enrolled student(s) and cannot be deleted. Unpublish it instead.`,
      );
    }

    // course_content rows are removed by ON DELETE CASCADE.
    await tx.delete(coursesTable).where(eq(coursesTable.id, courseId));
    return existing.thumbnail;
  });

  await deleteUnreferencedThumbnail(thumbnail);
  logger.info({ adminUid: req.auth?.uid, courseId }, "Course deleted");
  res.json({ success: true });
});

async function deleteUnreferencedThumbnail(thumbnail: string | null) {
  if (!thumbnail) return;
  const [{ refs }] = await db
    .select({ refs: count() })
    .from(coursesTable)
    .where(eq(coursesTable.thumbnail, thumbnail));
  if (refs === 0) await deleteLocalUpload(thumbnail);
}

export default router;
