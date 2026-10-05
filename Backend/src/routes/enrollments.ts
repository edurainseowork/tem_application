import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, liveClassesTable, notificationsTable, userCoursesTable } from "@workspace/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { findDbUserId, requireAuth } from "../middlewares/auth.js";

// TEMPORARY until Razorpay checkout is live: lets the app's "Buy now" record the enrollment in user_courses
// so enrollment-based features (Go Live notifications, entitlement checks) see the student.
// It grants access WITHOUT payment, so it only works while ALLOW_FREE_ENROLLMENT=true in .env.
// Turn that off (or delete this file) once purchases go through /razorpay/verify.
const router = Router();

router.post("/", requireAuth, async (req, res) => {
  if (process.env.ALLOW_FREE_ENROLLMENT !== "true") {
    res.status(403).json({ error: "Enrollment requires payment" });
    return;
  }

  const courseId = Number(req.body?.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    res.status(400).json({ error: "Invalid course ID" });
    return;
  }

  try {
    const userId = await findDbUserId(req.auth!.uid);
    if (userId === null) {
      res.status(404).json({ error: "User not found. Please log in again." });
      return;
    }
    const [course] = await db.select({ id: coursesTable.id, title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, courseId));
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const [existing] = await db.select({ id: userCoursesTable.id }).from(userCoursesTable)
      .where(and(eq(userCoursesTable.userId, userId), eq(userCoursesTable.courseId, courseId)))
      .limit(1);
    if (!existing) {
      await db.insert(userCoursesTable).values({ userId, courseId });
    }

    // Also notify the student about live classes already scheduled for this course
    const upcoming = await db.select().from(liveClassesTable)
      .where(and(eq(liveClassesTable.courseId, courseId), gt(liveClassesTable.endTime, new Date())));
    if (upcoming.length > 0) {
      await db.insert(notificationsTable).values(upcoming.map((liveClass) => ({
        userId,
        type: "live_class",
        title: "New Live Class Scheduled",
        body: `${liveClass.title} · ${course.title}`,
        liveClassId: liveClass.id,
      }))).onConflictDoNothing();
    }

    res.json({ success: true, enrolled: true, alreadyEnrolled: !!existing });
  } catch (error) {
    console.error("Failed to enroll", error);
    res.status(500).json({ error: "Failed to enroll in course" });
  }
});

export default router;
