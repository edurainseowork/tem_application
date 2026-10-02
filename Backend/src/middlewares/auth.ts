import type { NextFunction, Request, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@workspace/db";
import { userCoursesTable, usersTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { getAuth } from "../lib/firebaseAdmin.js";

// Keep in sync with ALLOWED_ADMIN_EMAILS in CMS-Portal; override with a comma-separated ADMIN_EMAILS env var
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "abhinavpvt1906@gmail.com,edurainseowork@gmail.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export const isAdminToken = (token: DecodedIdToken) =>
  !!token.email && ADMIN_EMAILS.includes(token.email.toLowerCase());

// Verifies the Firebase ID token sent as "Authorization: Bearer <token>" and stores it in res.locals.firebaseUser
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }
  try {
    res.locals.firebaseUser = await getAuth().verifyIdToken(header.slice("Bearer ".length));
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired auth token" });
  }
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  await requireAuth(req, res, () => {
    if (!isAdminToken(res.locals.firebaseUser)) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
};

export const findDbUserId = async (firebaseUid: string): Promise<number | null> => {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid));
  return user?.id ?? null;
};

export const isEnrolled = async (userId: number, courseId: number): Promise<boolean> => {
  const [enrollment] = await db.select({ id: userCoursesTable.id })
    .from(userCoursesTable)
    .where(and(eq(userCoursesTable.userId, userId), eq(userCoursesTable.courseId, courseId)))
    .limit(1);
  return !!enrollment;
};

// Admins can see every course; students only courses they are enrolled in
export const canAccessCourse = async (token: DecodedIdToken, courseId: number): Promise<boolean> => {
  if (isAdminToken(token)) return true;
  const userId = await findDbUserId(token.uid);
  return userId !== null && isEnrolled(userId, courseId);
};