import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, liveClassesTable, notificationsTable } from "@workspace/db/schema";
import { getLiveClassStatus } from "@workspace/api-zod";
import { and, desc, eq } from "drizzle-orm";
import { findDbUserId, requireAuth } from "../middlewares/auth.js";
import { MAX_NOTIFICATIONS_PER_USER } from "./liveClasses.js";

const router = Router();

router.use(requireAuth);

// Get the signed-in student's latest notifications, newest first
router.get("/", async (req, res) => {
  try {
    const userId = await findDbUserId(res.locals.firebaseUser.uid);
    if (userId === null) {
      res.json({ success: true, data: [] });
      return;
    }

    const rows = await db.select({
      notification: notificationsTable,
      liveClass: liveClassesTable,
      courseTitle: coursesTable.title,
    })
      .from(notificationsTable)
      .leftJoin(liveClassesTable, eq(notificationsTable.liveClassId, liveClassesTable.id))
      .leftJoin(coursesTable, eq(liveClassesTable.courseId, coursesTable.id))
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
      .limit(MAX_NOTIFICATIONS_PER_USER);

    res.json({
      success: true,
      data: rows.map(({ notification, liveClass, courseTitle }) => ({
        ...notification,
        liveClass: liveClass
          ? { ...liveClass, courseTitle, status: getLiveClassStatus(liveClass.startTime, liveClass.endTime) }
          : null,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch notifications", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Mark all of the signed-in student's notifications as read
router.post("/read-all", async (req, res) => {
  try {
    const userId = await findDbUserId(res.locals.firebaseUser.uid);
    if (userId !== null) {
      await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, userId));
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to update notifications", error);
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

// Mark a single notification as read
router.post("/:id/read", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid notification ID" });
    return;
  }

  try {
    const userId = await findDbUserId(res.locals.firebaseUser.uid);
    if (userId !== null) {
      await db.update(notificationsTable).set({ isRead: true })
        .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to update notification", error);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

export default router;
