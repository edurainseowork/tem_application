import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, liveClassesTable, notificationsTable, userCoursesTable, type LiveClass } from "@workspace/db/schema";
import { CreateLiveClassBody, getLiveClassStatus } from "@workspace/api-zod";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { canAccessCourse, requireAdmin, requireAuth } from "../middlewares/auth.js";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Each student keeps only their most recent notifications; older ones are deleted
export const MAX_NOTIFICATIONS_PER_USER = 20;

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const serializeLiveClass = (liveClass: LiveClass) => ({
  ...liveClass,
  status: getLiveClassStatus(liveClass.startTime, liveClass.endTime),
});

// Creates one in-app notification per enrolled student; students already notified are skipped
const notifyEnrolledStudents = async (tx: Tx, liveClass: LiveClass, courseTitle: string) => {
  const enrolled = await tx.selectDistinct({ userId: userCoursesTable.userId })
    .from(userCoursesTable)
    .where(eq(userCoursesTable.courseId, liveClass.courseId));
  if (enrolled.length === 0) return 0;

  const inserted = await tx.insert(notificationsTable).values(enrolled.map(({ userId }) => ({
    userId,
    type: "live_class",
    title: "New Live Class Scheduled",
    body: `${liveClass.title} · ${courseTitle}`,
    liveClassId: liveClass.id,
  }))).onConflictDoNothing().returning({ id: notificationsTable.id });

  await pruneOldNotifications(tx, enrolled.map(({ userId }) => userId));
  return inserted.length;
};

// Deletes everything beyond each user's newest MAX_NOTIFICATIONS_PER_USER notifications
const pruneOldNotifications = async (tx: Tx, userIds: number[]) => {
  if (userIds.length === 0) return;
  await tx.execute(sql`
    DELETE FROM ${notificationsTable}
    WHERE ${notificationsTable.id} IN (
      SELECT id FROM (
        SELECT ${notificationsTable.id} AS id,
               row_number() OVER (PARTITION BY ${notificationsTable.userId} ORDER BY ${notificationsTable.createdAt} DESC, ${notificationsTable.id} DESC) AS position
        FROM ${notificationsTable}
        WHERE ${notificationsTable.userId} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
      ) ranked
      WHERE position > ${MAX_NOTIFICATIONS_PER_USER}
    )
  `);
};

// Create a live class for a course and notify enrolled students (Admin)
router.post("/courses/:courseId/live-classes", requireAdmin, async (req, res) => {
  const courseId = parseId(req.params.courseId as string);
  if (!courseId) {
    res.status(400).json({ error: "Invalid course ID" });
    return;
  }

  const parsed = CreateLiveClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid live class details", issues: parsed.error.issues });
    return;
  }

  try {
    const [course] = await db.select({ id: coursesTable.id, title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, courseId));
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const { title, startTime, endTime, meetUrl } = parsed.data;
    const result = await db.transaction(async (tx) => {
      const [liveClass] = await tx.insert(liveClassesTable).values({
        courseId,
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        meetUrl,
      }).returning();
      const notifiedCount = await notifyEnrolledStudents(tx, liveClass, course.title);
      return { liveClass, notifiedCount };
    });

    res.status(201).json({ success: true, data: serializeLiveClass(result.liveClass), notifiedCount: result.notifiedCount });
  } catch (error: any) {
    console.error("Failed to create live class", error);
    res.status(500).json({ error: "Failed to create live class" });
  }
});

// Get live and upcoming classes for a course (Admin, or enrolled students)
router.get("/courses/:courseId/live-classes", requireAuth, async (req, res) => {
  const courseId = parseId(req.params.courseId as string);
  if (!courseId) {
    res.status(400).json({ error: "Invalid course ID" });
    return;
  }

  try {
    if (!(await canAccessCourse(req.auth!, courseId))) {
      res.status(403).json({ error: "You are not enrolled in this course" });
      return;
    }

    const liveClasses = await db.select().from(liveClassesTable)
      .where(and(eq(liveClassesTable.courseId, courseId), gt(liveClassesTable.endTime, new Date())))
      .orderBy(asc(liveClassesTable.startTime));
    res.json({ success: true, data: liveClasses.map(serializeLiveClass) });
  } catch (error) {
    console.error("Failed to fetch live classes", error);
    res.status(500).json({ error: "Failed to fetch live classes" });
  }
});

// Get a single live class (Admin, or students enrolled in its course)
router.get("/live-classes/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) {
    res.status(400).json({ error: "Invalid live class ID" });
    return;
  }

  try {
    const [liveClass] = await db.select().from(liveClassesTable).where(eq(liveClassesTable.id, id));
    // Same 404 for missing and not-enrolled so students cannot probe other courses' classes
    if (!liveClass || !(await canAccessCourse(req.auth!, liveClass.courseId))) {
      res.status(404).json({ error: "Live class not found" });
      return;
    }
    res.json({ success: true, data: serializeLiveClass(liveClass) });
  } catch (error) {
    console.error("Failed to fetch live class", error);
    res.status(500).json({ error: "Failed to fetch live class" });
  }
});

// Re-send notifications, e.g. to students who enrolled after the class was scheduled (Admin)
router.post("/live-classes/:id/notify", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) {
    res.status(400).json({ error: "Invalid live class ID" });
    return;
  }

  try {
    const [row] = await db.select({ liveClass: liveClassesTable, courseTitle: coursesTable.title })
      .from(liveClassesTable)
      .innerJoin(coursesTable, eq(liveClassesTable.courseId, coursesTable.id))
      .where(eq(liveClassesTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Live class not found" });
      return;
    }
    if (getLiveClassStatus(row.liveClass.startTime, row.liveClass.endTime) === "ended") {
      res.status(400).json({ error: "This live class has already ended" });
      return;
    }

    const notifiedCount = await db.transaction((tx) => notifyEnrolledStudents(tx, row.liveClass, row.courseTitle));
    res.json({ success: true, notifiedCount });
  } catch (error) {
    console.error("Failed to send live class notifications", error);
    res.status(500).json({ error: "Failed to send notifications" });
  }
});

// Cancel a live class; its notifications are removed by the cascade (Admin)
router.delete("/live-classes/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) {
    res.status(400).json({ error: "Invalid live class ID" });
    return;
  }

  try {
    await db.transaction(async (tx) => { await tx.delete(notificationsTable).where(eq(notificationsTable.liveClassId, id)); await tx.delete(liveClassesTable).where(eq(liveClassesTable.id, id)); });
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete live class", error);
    res.status(500).json({ error: "Failed to delete live class" });
  }
});

export default router;
