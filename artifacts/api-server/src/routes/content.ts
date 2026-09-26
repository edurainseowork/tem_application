import { Router } from "express";
import { db } from "@workspace/db";
import { userCoursesTable, coursesTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// Securely fetch content for a course
router.get("/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const firebaseUid = req.query.uid as string;

  if (!firebaseUid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
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

    const courses = await db.select().from(coursesTable).where(eq(coursesTable.id, parseInt(courseId)));
    const course = courses[0];

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({
      vimeoId: course.vimeoId,
      pdfUrl: course.pdfUrl
    });
    return;
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch content" });
    return;
  }
});

export default router;
