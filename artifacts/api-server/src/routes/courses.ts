import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Get all courses (catalog)
router.get("/", async (req, res) => {
  try {
    const courses = await db.select({
      id: coursesTable.id,
      title: coursesTable.title,
      description: coursesTable.description,
      price: coursesTable.price,
      thumbnail: coursesTable.thumbnail,
      category: coursesTable.category,
    }).from(coursesTable);
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

export default router;
