import express, { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { coursesTable, userCoursesTable, usersTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth.js";
import { rateLimit } from "../middlewares/security";
import { HttpError } from "../lib/http-error";
import { logger } from "../lib/logger";
import { toPublicUrl } from "../lib/media";
import { firebaseAuth } from "../lib/firebase-admin";
import { deletePublicImage, detectImageType, uploadPublicImage } from "../lib/s3";
import { currentStreak, recordActivity } from "../lib/streak";

// The signed-in student's own profile (app → Profile tab). Every route acts on the caller only.
const router = Router();

router.use(requireAuth);

const PROFILE_PHOTO_FOLDER = "profile-photos";
// The app resizes and compresses photos to ~50–150 KB before upload; this is only a safety cap
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_PHOTO_MAX_BYTES, files: 1, fields: 0 },
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number")
      .nullable()
      .or(z.literal("").transform(() => null)),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable(),
    address: optionalText(300),
    city: optionalText(80),
    state: optionalText(80),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode")
      .nullable()
      .or(z.literal("").transform(() => null)),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

function requireDbUserId(req: Request): number {
  const id = req.user?.id;
  if (!id) throw new HttpError(401, "Could not load your account. Please log in again.");
  return id;
}

async function loadProfile(req: Request, userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) throw new HttpError(404, "Account not found");

  const purchases = await db
    .select({
      id: coursesTable.id,
      title: coursesTable.title,
      thumbnail: coursesTable.thumbnail,
      category: coursesTable.category,
      purchasedAt: userCoursesTable.purchasedAt,
    })
    .from(userCoursesTable)
    .innerJoin(coursesTable, eq(userCoursesTable.courseId, coursesTable.id))
    .where(eq(userCoursesTable.userId, userId))
    .orderBy(desc(userCoursesTable.purchasedAt));

  const now = new Date();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    gender: user.gender,
    address: user.address,
    city: user.city,
    state: user.state,
    pincode: user.pincode,
    profilePhoto: user.profilePhoto,
    memberSince: user.createdAt,
    streak: {
      current: currentStreak(user, now),
      longest: user.longestStreak,
      lastActiveAt: user.lastActiveAt,
    },
    courses: purchases.map((c) => ({ ...c, thumbnail: c.thumbnail ? toPublicUrl(c.thumbnail, req) : null })),
  };
}

// GET /api/profile
router.get("/", async (req, res) => {
  const userId = requireDbUserId(req);

  // Firebase only changes the login email after the student confirms it, so the token's email is
  // the verified one; keep the database copy in step with it.
  const tokenEmail = req.auth?.email?.trim().toLowerCase();
  if (tokenEmail && req.user && req.user.email.toLowerCase() !== tokenEmail) {
    await db.update(usersTable).set({ email: tokenEmail, updatedAt: new Date() }).where(eq(usersTable.id, userId));
  }

  res.json({ success: true, data: await loadProfile(req, userId) });
});

// PATCH /api/profile  { name?, phone?, gender?, address?, city?, state?, pincode? }
router.patch("/", async (req, res) => {
  const userId = requireDbUserId(req);
  const input = updateProfileSchema.parse(req.body ?? {});

  await db.update(usersTable).set({ ...input, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  // Keep the Firebase display name (used by the app header and greetings) in sync
  const uid = req.auth?.uid;
  if (input.name && uid && !uid.startsWith("test-")) {
    await firebaseAuth.updateUser(uid, { displayName: input.name }).catch((err) => {
      logger.warn({ err, uid }, "Could not update Firebase display name");
    });
  }

  logger.info({ userId, fields: Object.keys(input) }, "Profile updated");
  res.json({ success: true, data: await loadProfile(req, userId) });
});

// POST /api/profile/activity — call when the app is opened or brought to the foreground
router.post("/activity", rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const userId = requireDbUserId(req);
  const now = new Date();

  // Row lock: two pings arriving together must not both extend the streak
  const next = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        streakCount: usersTable.streakCount,
        longestStreak: usersTable.longestStreak,
        lastActiveAt: usersTable.lastActiveAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");
    if (!user) throw new HttpError(404, "Account not found");

    const state = recordActivity(user, now);
    await tx.update(usersTable).set(state).where(eq(usersTable.id, userId));
    return state;
  });

  res.json({
    success: true,
    data: { current: currentStreak(next, now), longest: next.longestStreak, lastActiveAt: next.lastActiveAt },
  });
});

// The app sends the image bytes as the request body (Content-Type: application/octet-stream or
// image/*): Expo's fetch (SDK 52+) cannot send React Native's { uri, name, type } FormData parts.
// A multipart field "photo" is accepted too (e.g. web or other clients).
const rawImage = express.raw({ type: ["application/octet-stream", "image/*"], limit: PROFILE_PHOTO_MAX_BYTES });
const parsePhoto = (req: Request, res: Response, next: NextFunction) => {
  if (req.is("multipart/form-data")) {
    upload.single("photo")(req, res, next);
    return;
  }
  rawImage(req, res, next);
};

// POST /api/profile/photo  (raw image body, or multipart field "photo": PNG/JPEG/WEBP)
router.post("/photo", rateLimit({ windowMs: 60_000, max: 10 }), parsePhoto, async (req, res) => {
  const userId = requireDbUserId(req);
  const buffer = req.file?.buffer ?? (Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : null);
  if (!buffer) throw new HttpError(400, "No photo uploaded");

  // Checked by content, not by the file name or MIME type the phone reports
  const type = detectImageType(buffer);
  if (!type) throw new HttpError(400, "Photo must be a PNG, JPEG or WEBP image");

  let photoUrl: string;
  try {
    photoUrl = await uploadPublicImage(buffer, type, PROFILE_PHOTO_FOLDER);
  } catch (err) {
    logger.error({ err }, "Failed to upload profile photo to S3");
    throw new HttpError(502, "Could not upload the photo. Please try again.");
  }

  const [previous] = await db.select({ profilePhoto: usersTable.profilePhoto }).from(usersTable).where(eq(usersTable.id, userId));
  await db.update(usersTable).set({ profilePhoto: photoUrl, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  if (previous?.profilePhoto) {
    await deletePublicImage(previous.profilePhoto, PROFILE_PHOTO_FOLDER).catch((err) =>
      logger.warn({ err, userId }, "Could not delete old profile photo"),
    );
  }

  logger.info({ userId, size: buffer.length }, "Profile photo updated");
  res.json({ success: true, data: await loadProfile(req, userId) });
});

// DELETE /api/profile/photo
router.delete("/photo", async (req, res) => {
  const userId = requireDbUserId(req);
  const [previous] = await db.select({ profilePhoto: usersTable.profilePhoto }).from(usersTable).where(eq(usersTable.id, userId));
  await db.update(usersTable).set({ profilePhoto: null, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  if (previous?.profilePhoto) {
    await deletePublicImage(previous.profilePhoto, PROFILE_PHOTO_FOLDER).catch((err) =>
      logger.warn({ err, userId }, "Could not delete profile photo"),
    );
  }
  res.json({ success: true, data: await loadProfile(req, userId) });
});

export default router;