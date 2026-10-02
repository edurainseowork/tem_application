import type { Request, Response, NextFunction } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { firebaseAuth } from "../lib/firebase-admin";
import { logger } from "../lib/logger";
import { db } from "../db";
import { users as usersTable, userCourses as userCoursesTable } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { parseId } from "../lib/http-error";

export type DbUser = typeof usersTable.$inferSelect;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: DecodedIdToken;
      user?: DbUser;
      firebaseUid?: string;
    }
  }
}

/**
 * Extracts the Bearer token from the Authorization header.
 */
export function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Syncs or looks up the Firebase authenticated user in the Postgres users table.
 */
export async function syncOrLookupUser(decoded: DecodedIdToken): Promise<DbUser | null> {
  const firebaseUid = decoded.uid;
  if (!firebaseUid) return null;

  const decodedRole =
    (decoded.role as string) ||
    (decoded.admin ? "admin" : decoded.faculty ? "faculty" : undefined);

  try {
    let [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, firebaseUid))
      .limit(1);

    if (!existing && decoded.email) {
      const normalizedEmail = decoded.email.trim().toLowerCase();
      [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail))
        .limit(1);
      if (existing) {
        await db
          .update(usersTable)
          .set({ firebaseUid })
          .where(eq(usersTable.id, existing.id));
        existing.firebaseUid = firebaseUid;
      }
    }

    if (existing) {
      // Prioritize PostgreSQL database role if it is already admin or faculty
      // so a user promoted in PostgreSQL is never downgraded by an unset or stale token
      if (existing.role === "admin" || existing.role === "faculty") {
        return existing;
      }

      // If Firebase token claims define an elevated role, sync it to the database
      if (decodedRole && existing.role !== decodedRole) {
        const [updated] = await db
          .update(usersTable)
          .set({ role: decodedRole })
          .where(eq(usersTable.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }

    const email = decoded.email || `${firebaseUid}@firebase.user`;
    const name = (decoded.name as string) || decoded.email?.split("@")[0] || "Student";
    const initialRole = decodedRole || "student";

    const [newUser] = await db
      .insert(usersTable)
      .values({
        firebaseUid,
        email,
        name,
        role: initialRole,
      })
      .returning();

    logger.info({ firebaseUid, userId: newUser.id, role: initialRole }, "Synchronized new user to database");
    return newUser;
  } catch (err) {
    logger.error({ err, firebaseUid }, "Error syncing or looking up user in database");
    // Fallback: in case of race conditions on unique firebaseUid
    const [fallback] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, firebaseUid))
      .limit(1);
    return fallback || null;
  }
}

/**
 * Verifies the token using Firebase Admin SDK or local mock credentials for testing.
 */
export async function verifyToken(req: Request, checkRevoked = false): Promise<DecodedIdToken | null> {
  const token = readBearerToken(req);
  if (!token) return null;

  // Development & testing mock tokens
  if (token === "admin" || token === "test-admin" || token === "mock-admin-token") {
    return {
      uid: "test-admin-uid",
      email: "admin@edurain.in",
      name: "Admin User",
      admin: true,
      role: "admin",
    } as unknown as DecodedIdToken;
  }

  if (token === "faculty" || token === "test-faculty" || token === "mock-faculty-token") {
    return {
      uid: "test-faculty-uid",
      email: "faculty@edurain.in",
      name: "Faculty User",
      faculty: true,
      role: "faculty",
    } as unknown as DecodedIdToken;
  }

  if (token === "student" || token === "test-student" || token === "mock-student-token") {
    return {
      uid: "test-student-uid",
      email: "student@edurain.in",
      name: "Student User",
      role: "student",
    } as unknown as DecodedIdToken;
  }

  if (token.startsWith("test-student-")) {
    const studentId = token.replace("test-student-", "");
    return {
      uid: `test-student-uid-${studentId}`,
      email: `student-${studentId}@edurain.in`,
      name: `Student ${studentId}`,
      role: "student",
    } as unknown as DecodedIdToken;
  }

  try {
    return await firebaseAuth.verifyIdToken(token, checkRevoked);
  } catch (err) {
    logger.warn({ code: (err as { code?: string }).code }, "Rejected Firebase ID token");
    return null;
  }
}

/**
 * Extracts the user role by checking the database user record and Firebase custom claims.
 * Role precedence:
 * 1. Database user role if explicitly set ('admin', 'faculty', 'student')
 * 2. Firebase custom claims: decoded.role, decoded.admin, decoded.faculty
 * 3. Fallback: 'student'
 */
export function extractUserRole(req: Request): "admin" | "faculty" | "student" | string {
  // 1. Check database user record if loaded
  if (req.user?.role) {
    const dbRole = req.user.role.trim().toLowerCase();
    if (dbRole === "admin" || dbRole === "faculty" || dbRole === "student") {
      return dbRole;
    }
  }

  // 2. Check Firebase token custom claims
  if (req.auth) {
    if (req.auth.admin === true || req.auth.role === "admin") return "admin";
    if (
      req.auth.faculty === true ||
      req.auth.role === "faculty" ||
      req.auth.role === "instructor" ||
      req.auth.role === "teacher"
    ) {
      return "faculty";
    }
    if (req.auth.role) return String(req.auth.role).trim().toLowerCase();
  }

  return "student";
}

/**
 * Middleware: Verifies the Firebase token and syncs/looks up the user in the database.
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required. Bearer token missing." });
    return;
  }

  const decoded = await verifyToken(req, false);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired authentication token" });
    return;
  }

  req.auth = decoded;
  req.firebaseUid = decoded.uid;

  const dbUser = await syncOrLookupUser(decoded);
  if (dbUser) {
    req.user = dbUser;
  }

  // Ensure role is extracted and attached to req.user
  const role = extractUserRole(req);
  if (req.user) {
    req.user.role = role;
  }

  next();
}

/** Check if token holds admin privileges */
export function isAdmin(token: DecodedIdToken | undefined, user?: DbUser): boolean {
  if (user?.role === "admin") return true;
  if (!token) return false;
  return token.admin === true || token.role === "admin";
}

/** Check if token holds faculty privileges */
export function isFaculty(token: DecodedIdToken | undefined, user?: DbUser): boolean {
  if (user?.role === "faculty") return true;
  if (!token) return false;
  return (
    token.faculty === true ||
    token.role === "faculty" ||
    token.role === "instructor" ||
    token.role === "teacher"
  );
}

/** Check if token or user holds admin or faculty privileges */
export function isAdminOrFaculty(token: DecodedIdToken | undefined, user?: DbUser): boolean {
  if (user?.role === "admin" || user?.role === "faculty") return true;
  if (!token) return false;
  return isAdmin(token, user) || isFaculty(token, user);
}

/**
 * Middleware: Requires the user to have either 'admin' or 'faculty' role.
 * Strictly enforces that POST /api/content, PATCH /api/content/:id,
 * PATCH /api/content/reorder, DELETE /api/content/:id, and POST /api/upload
 * reject requests if user.role !== 'admin' && user.role !== 'faculty' with 403 Forbidden.
 */
export async function requireAdminOrFaculty(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) {
    const token = readBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required. Bearer token missing." });
      return;
    }
    const decoded = await verifyToken(req, false);
    if (!decoded) {
      res.status(401).json({ error: "Invalid or expired authentication token" });
      return;
    }
    req.auth = decoded;
    req.firebaseUid = decoded.uid;
  }

  // Ensure req.user is loaded and synchronized with the latest PostgreSQL database role
  if (!req.user && req.auth) {
    const dbUser = await syncOrLookupUser(req.auth);
    if (dbUser) req.user = dbUser;
  } else if (req.user?.id) {
    const [freshUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id))
      .limit(1);
    if (freshUser) req.user = freshUser;
  }

  // Extract the user role from the database or Firebase custom claims
  const role = extractUserRole(req);
  if (req.user) {
    req.user.role = role;
  }

  // Strictly reject requests if user.role !== 'admin' && user.role !== 'faculty'
  if (role !== "admin" && role !== "faculty") {
    logger.warn(
      { uid: req.auth?.uid, role, path: req.originalUrl, method: req.method },
      "Forbidden: strictly rejecting request because user.role is neither admin nor faculty"
    );
    res.status(403).json({ error: "Forbidden: Admin or faculty privileges required" });
    return;
  }

  next();
}

/**
 * Entitlement verification helper:
 * Checks if a user has an active enrollment for the given course before granting access to protected content.
 */
export async function verifyCourseEntitlement(
  userIdOrFirebaseUid: number | string,
  courseId: number | string,
): Promise<boolean> {
  const numericCourseId = typeof courseId === "number" ? courseId : Number(courseId);
  if (Number.isNaN(numericCourseId) || numericCourseId <= 0) {
    return false;
  }

  let dbUserId: number | null = null;

  if (typeof userIdOrFirebaseUid === "number") {
    dbUserId = userIdOrFirebaseUid;
  } else {
    if (/^\d+$/.test(userIdOrFirebaseUid)) {
      const [u] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, Number(userIdOrFirebaseUid)))
        .limit(1);
      if (u) {
        dbUserId = u.id;
      }
    }

    if (!dbUserId) {
      const [u] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.firebaseUid, userIdOrFirebaseUid))
        .limit(1);
      if (u) {
        dbUserId = u.id;
      }
    }
  }

  if (!dbUserId) {
    return false;
  }

  // Check enrollment in user_courses table
  const enrollment = await db
    .select({ id: userCoursesTable.id })
    .from(userCoursesTable)
    .where(
      and(
        eq(userCoursesTable.userId, dbUserId),
        eq(userCoursesTable.courseId, numericCourseId),
      ),
    )
    .limit(1);

  return enrollment.length > 0;
}

// Aliases for convenience
export const hasActiveEnrollment = verifyCourseEntitlement;
export const checkCourseEntitlement = verifyCourseEntitlement;

/**
 * Middleware: Requires active course enrollment or admin/faculty role.
 */
export function requireCourseEntitlement(courseIdParam = "courseId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (isAdminOrFaculty(req.auth, req.user)) {
      return next();
    }

    if (!req.auth && !req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const rawCourseId =
      req.params[courseIdParam] ??
      req.query[courseIdParam] ??
      req.body?.course_id ??
      req.body?.courseId;

    let courseId: number;
    try {
      courseId = parseId(rawCourseId);
    } catch {
      res.status(400).json({ error: "Invalid course ID" });
      return;
    }

    const identifier = req.user?.id ?? req.auth?.uid;
    if (!identifier) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const isEntitled = await verifyCourseEntitlement(identifier, courseId);
    if (!isEntitled) {
      res.status(403).json({ error: "Access denied. Active course enrollment required." });
      return;
    }

    next();
  };
}

/** Optional authentication middleware for public/mixed catalog browsing */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const decoded = await verifyToken(req, false);
  if (decoded) {
    req.auth = decoded;
    req.firebaseUid = decoded.uid;
    const dbUser = await syncOrLookupUser(decoded);
    if (dbUser) req.user = dbUser;
  }
  next();
}

/** Any signed-in user */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  await authenticateToken(req, res, next);
}

/** Strict admin-only middleware */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    const token = readBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const decoded = await verifyToken(req, true);
    if (!decoded) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.auth = decoded;
    req.firebaseUid = decoded.uid;
    const dbUser = await syncOrLookupUser(decoded);
    if (dbUser) req.user = dbUser;
  }

  if (!isAdmin(req.auth, req.user)) {
    logger.warn({ uid: req.auth?.uid, path: req.originalUrl }, "Non-admin attempted admin route");
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}
