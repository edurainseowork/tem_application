import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, courseContentTable, userCoursesTable } from "@workspace/db/schema";
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
    console.error("Database query failed", error);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

// Get a single course by ID
router.get("/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (isNaN(courseId)) return res.status(400).json({ error: "Invalid ID" });
    
    const course = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId));
    if (course.length === 0) return res.status(404).json({ error: "Course not found" });
    
    res.json(course[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch course" });
  }
});

// Create a new course
router.post("/", async (req, res) => {
  try {
    const { title, description, price, thumbnail, category } = req.body;
    
    if (!title || !description || !price || !thumbnail || !category) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [newCourse] = await db.insert(coursesTable).values({
      title,
      description,
      price: Number(price),
      thumbnail,
      category,
    }).returning();

    res.json({ success: true, course: newCourse });
  } catch (error: any) {
    console.error("Failed to create course", error);
    res.status(500).json({ error: "Failed to create course" });
  }
});

// Delete a course
router.delete("/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (isNaN(courseId)) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    // Manually delete foreign key dependencies to prevent constraint errors
    await db.delete(userCoursesTable).where(eq(userCoursesTable.courseId, courseId));
    await db.delete(courseContentTable).where(eq(courseContentTable.courseId, courseId));
    
    await db.delete(coursesTable).where(eq(coursesTable.id, courseId));
    res.json({ success: true, message: "Course deleted successfully" });
  } catch (error: any) {
    console.error("Failed to delete course", error);
    res.status(500).json({ error: "Failed to delete course", details: error.message });
  }
});

export default router;
