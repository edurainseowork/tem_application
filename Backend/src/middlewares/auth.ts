<<<<<<< Updated upstream
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
=======
// Adapter: lets the Go Live / notifications / coupon routes use the team's auth in ../middleware/auth.
// Those routes read the verified Firebase token from res.locals.firebaseUser, so the wrappers below set it.
import type { NextFunction, Request, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users as usersTable } from "../db/schema.js";
import {
  isAdminOrFaculty,
  requireAdmin as teamRequireAdmin,
  requireAuth as teamRequireAuth,
  verifyCourseEntitlement,
} from "../middleware/auth.js";

export * from "../middleware/auth.js";

// Runs the team middleware, then exposes the decoded token on res.locals for our routes
const withFirebaseUser =
  (middleware: (req: Request, res: Response, next: NextFunction) => unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    await middleware(req, res, () => {
      res.locals.firebaseUser = req.auth;
      next();
    });
  };

// These local exports take precedence over the same names from `export *` above
export const requireAuth = withFirebaseUser(teamRequireAuth);
export const requireAdmin = withFirebaseUser(teamRequireAdmin);

export const findDbUserId = async (firebaseUid: string): Promise<number | null> => {
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid))
    .limit(1);
  return user?.id ?? null;
};

// Admins and faculty see every course; students only courses they are enrolled in
export const canAccessCourse = async (token: DecodedIdToken, courseId: number): Promise<boolean> => {
  if (isAdminOrFaculty(token)) return true;
  return verifyCourseEntitlement(token.uid, courseId);
>>>>>>> Stashed changes
};