import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, coursesTable } from "@workspace/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { publicCourseColumns, withPublicThumbnail } from "../lib/course-view";
import { publicCourseQuerySchema } from "../lib/course-schemas";
import { HttpError, parseId } from "../lib/http-error";

// Public catalog used by the mobile app. Only published courses are ever returned.
// Admin CRUD lives in routes/admin/courses.ts.
const router = Router();

// GET /api/courses?category=<slug>
router.get("/", async (req, res) => {
  const { category } = publicCourseQuerySchema.parse(req.query);

  const courses = await db
    .select(publicCourseColumns)
    .from(coursesTable)
    .leftJoin(categoriesTable, eq(coursesTable.categoryId, categoriesTable.id))
    .where(
      and(
        eq(coursesTable.isPublished, true),
        category ? eq(categoriesTable.slug, category) : undefined,
      ),
    )
    .orderBy(asc(categoriesTable.sortOrder), desc(coursesTable.publishedAt), desc(coursesTable.id));

  res.json(courses.map((c) => withPublicThumbnail(c, req)));
});

// GET /api/courses/:id
router.get("/:id", async (req, res) => {
  const courseId = parseId(req.params.id);

  const [course] = await db
    .select(publicCourseColumns)
    .from(coursesTable)
    .leftJoin(categoriesTable, eq(coursesTable.categoryId, categoriesTable.id))
    .where(and(eq(coursesTable.id, courseId), eq(coursesTable.isPublished, true)));

  // Drafts answer 404, not 403, so their existence is not revealed.
  if (!course) throw new HttpError(404, "Course not found");

  res.json(withPublicThumbnail(course, req));
});

export default router;
