import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminNotificationsTable, pushTokensTable, usersTable } from "@workspace/db/schema";
import { AdminNotificationBody, NOTIFICATION_IMAGE_MAX_BYTES } from "@workspace/api-zod";
import { HttpError } from "../../lib/http-error";
import { logger } from "../../lib/logger";
import { detectImageType, uploadPublicImage } from "../../lib/s3";
import { sendExpoPush } from "../../lib/expoPush";
import { rateLimit } from "../../middlewares/security";

// Admin notifications (CMS sidebar → Notifications). Separate from live class notifications.
// Mounted under /api/admin, so every route here already requires an admin token.
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: NOTIFICATION_IMAGE_MAX_BYTES, files: 1, fields: 5 },
});

// Optional image arrives as multipart field "image"; plain JSON bodies are accepted too
const parseMultipart = (req: Request, res: Response, next: NextFunction) => {
  if (req.is("multipart/form-data")) {
    upload.single("image")(req, res, next);
    return;
  }
  next();
};

// Notifications already sent, newest first
router.get("/", async (_req, res) => {
  const rows = await db.select().from(adminNotificationsTable)
    .orderBy(desc(adminNotificationsTable.createdAt))
    .limit(50);
  res.json({ success: true, data: rows });
});

// Send a notification to every registered user: saved for the in-app history and pushed to all devices
router.post("/", rateLimit({ windowMs: 60_000, max: 10 }), parseMultipart, async (req, res) => {
  const { title, description } = AdminNotificationBody.parse(req.body ?? {});

  let imageUrl: string | null = null;
  if (req.file) {
    const type = detectImageType(req.file.buffer);
    if (!type) throw new HttpError(400, "Image must be a PNG, JPEG or WEBP file");
    try {
      imageUrl = await uploadPublicImage(req.file.buffer, type, "notifications");
    } catch (err) {
      logger.error({ err }, "Failed to upload notification image to S3");
      throw new HttpError(502, "Could not upload the image to S3. Check the AWS settings in .env.");
    }
  }

  // Save first, so it appears in the app's history even if push delivery fails
  const [{ value: recipientCount }] = await db.select({ value: count() }).from(usersTable);
  const [notification] = await db.insert(adminNotificationsTable).values({
    title,
    body: description,
    imageUrl,
    sentBy: req.auth?.email ?? null,
    recipientCount,
  }).returning();

  const tokens = (await db.select({ token: pushTokensTable.token }).from(pushTokensTable)).map((row) => row.token);
  const push = await sendExpoPush(tokens, {
    title,
    body: description,
    imageUrl,
    data: { type: "admin_notification", adminNotificationId: notification.id },
  });

  const [updated] = await db.update(adminNotificationsTable)
    .set({ pushSentCount: push.sent, pushFailedCount: push.failed })
    .where(eq(adminNotificationsTable.id, notification.id))
    .returning();

  logger.info({ adminNotificationId: notification.id, recipientCount, ...push }, "Admin notification sent");
  res.status(201).json({ success: true, data: updated, devices: tokens.length });
});

export default router;
