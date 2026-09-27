import { Router } from "express";
import { db } from "@workspace/db";
import { userCoursesTable, coursesTable, usersTable, courseContentTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// Get all content for a course (Supports both Admin CMS and App)
router.get("/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const firebaseUid = req.query.uid as string;
  const isAdmin = req.query.admin === "true";

  try {
    if (!isAdmin) {
      if (!firebaseUid) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const users = await db.select().from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid));
      if (users.length === 0) return res.status(401).json({ error: "User not found" });

      const purchased = await db.select()
        .from(userCoursesTable)
        .where(and(
          eq(userCoursesTable.userId, users[0].id),
          eq(userCoursesTable.courseId, parseInt(courseId))
        ));

      if (purchased.length === 0) {
        return res.status(403).json({ error: "Course not purchased" });
      }
    }

    const content = await db.select().from(courseContentTable).where(eq(courseContentTable.courseId, parseInt(courseId)));
    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

// Create new content (folder, pdf, video)
router.post("/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const { parentId, type, title, url } = req.body;

  try {
    const newContent = await db.insert(courseContentTable).values({
      courseId: parseInt(courseId),
      parentId: parentId ? parseInt(parentId) : null,
      type,
      title,
      url: url || null,
    }).returning();

    res.json({ success: true, data: newContent[0] });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create content", details: error.message });
  }
});

// Delete content
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.delete(courseContentTable).where(eq(courseContentTable.id, parseInt(id)));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete content", details: error.message });
  }
});

export default router;
