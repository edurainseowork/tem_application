import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, coursesTable } from "@workspace/db/schema";
import { asc, count, eq, sql } from "drizzle-orm";
import { createCategorySchema, slugify, updateCategorySchema } from "../../lib/course-schemas";
import { HttpError, parseId } from "../../lib/http-error";
import { logger } from "../../lib/logger";

// Mounted behind requireAdmin in routes/admin/index.ts.
const router = Router();

const categoryColumns = {
  id: categoriesTable.id,
  name: categoriesTable.name,
  slug: categoriesTable.slug,
  sortOrder: categoriesTable.sortOrder,
  createdAt: categoriesTable.createdAt,
  updatedAt: categoriesTable.updatedAt,
  courseCount: sql<number>`(select count(*) from "courses" c where c."category_id" = "categories"."id")`.mapWith(Number),
};

async function loadCategory(categoryId: number) {
  const [category] = await db.select(categoryColumns).from(categoriesTable).where(eq(categoriesTable.id, categoryId));
  if (!category) throw new HttpError(404, "Category not found");
  return category;
}

// GET /api/admin/categories
router.get("/", async (_req, res) => {
  const categories = await db
    .select(categoryColumns)
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));
  res.json({ success: true, data: categories });
});

// POST /api/admin/categories
router.post("/", async (req, res) => {
  const input = createCategorySchema.parse(req.body);
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw new HttpError(400, "Category name must contain letters or numbers");

  // Unique violations on name/slug become 409 in the error handler.
  const [created] = await db
    .insert(categoriesTable)
    .values({ name: input.name, slug, sortOrder: input.sortOrder })
    .returning({ id: categoriesTable.id });

  logger.info({ adminUid: req.auth?.uid, categoryId: created.id }, "Category created");
  res.status(201).json({ success: true, data: await loadCategory(created.id) });
});

// PATCH /api/admin/categories/:id
router.patch("/:id", async (req, res) => {
  const categoryId = parseId(req.params.id);
  const input = updateCategorySchema.parse(req.body);

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(categoriesTable)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(categoriesTable.id, categoryId))
      .returning({ name: categoriesTable.name });
    if (!updated) throw new HttpError(404, "Category not found");

    // Keep the denormalised name on courses in sync.
    if (input.name !== undefined) {
      await tx.update(coursesTable).set({ category: updated.name }).where(eq(coursesTable.categoryId, categoryId));
    }
  });

  logger.info({ adminUid: req.auth?.uid, categoryId, fields: Object.keys(input) }, "Category updated");
  res.json({ success: true, data: await loadCategory(categoryId) });
});

// DELETE /api/admin/categories/:id
router.delete("/:id", async (req, res) => {
  const categoryId = parseId(req.params.id);

  const [{ courses }] = await db
    .select({ courses: count() })
    .from(coursesTable)
    .where(eq(coursesTable.categoryId, categoryId));
  if (courses > 0) {
    throw new HttpError(409, `This category still has ${courses} course(s). Move or delete them first.`);
  }

  const deleted = await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.id, categoryId))
    .returning({ id: categoriesTable.id });
  if (deleted.length === 0) throw new HttpError(404, "Category not found");

  logger.info({ adminUid: req.auth?.uid, categoryId }, "Category deleted");
  res.json({ success: true });
});

export default router;
