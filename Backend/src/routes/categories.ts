import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable } from "@workspace/db/schema";
import { asc } from "drizzle-orm";

// Public category list for the mobile app's filter pills.
const router = Router();

router.get("/", async (_req, res) => {
  const categories = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      sortOrder: categoriesTable.sortOrder,
    })
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder), asc(categoriesTable.name));

  res.json(categories);
});

export default router;
