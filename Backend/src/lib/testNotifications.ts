import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { coursesTable, notificationsTable, pushTokensTable, userCoursesTable, type Test } from "@workspace/db/schema";
import { pruneOldNotifications } from "../routes/liveClasses.js";
import { sendExpoPush } from "./expoPush";
import { logger } from "./logger";

// Push text is written on the server, so it names the time zone the students use
const PUSH_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Kolkata";

const formatStart = (date: Date) =>
  date.toLocaleString("en-IN", { timeZone: PUSH_TIME_ZONE, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Tells every student enrolled in the test's course that a test is scheduled:
 * one in-app notification each (never twice for the same test) plus a push to their devices.
 * Never throws: a notification failure must not undo saving the test.
 */
export async function notifyTestScheduled(test: Test): Promise<number> {
  try {
    const [course] = await db.select({ title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, test.courseId));
    const enrolled = (await db.selectDistinct({ userId: userCoursesTable.userId }).from(userCoursesTable)
      .where(eq(userCoursesTable.courseId, test.courseId))).map((row) => row.userId);
    if (enrolled.length === 0) return 0;

    const when = `${formatStart(test.publishTime)} · ${test.durationMinutes} min`;
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx.insert(notificationsTable).values(enrolled.map((userId) => ({
        userId,
        type: "test",
        title: "New Test Scheduled",
        body: `${test.title} · ${course?.title ?? "Your course"} · ${when}`,
        testId: test.id,
      }))).onConflictDoNothing().returning({ userId: notificationsTable.userId });
      await pruneOldNotifications(tx, enrolled);
      return rows.map((row) => row.userId);
    });
    if (inserted.length === 0) return 0; // everyone was already told about this test

    const tokens = (await db.select({ token: pushTokensTable.token }).from(pushTokensTable)
      .where(inArray(pushTokensTable.userId, inserted))).map((row) => row.token);
    const push = await sendExpoPush(tokens, {
      title: `New test: ${test.title}`,
      body: `${course?.title ?? "Your course"} · starts ${when}`,
      data: { type: "test", testId: test.id, courseId: test.courseId },
    });
    logger.info({ testId: test.id, notified: inserted.length, ...push }, "Test notification sent");
    return inserted.length;
  } catch (err) {
    logger.error({ err, testId: test.id }, "Failed to send test notifications");
    return 0;
  }
}
