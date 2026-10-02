export * from "../middleware/auth";
import { db } from "../db/index.js";
import { users as usersTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifyCourseEntitlement, isAdminOrFaculty } from "../middleware/auth.js";

export const findDbUserId = async (firebaseUid: string): Promise<number | null> => {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid)).limit(1);
  return user?.id ?? null;
};

export const canAccessCourse = async (token: DecodedIdToken, courseId: number): Promise<boolean> => {
  // Use existing shivankar_01 robust auth logic
  if (isAdminOrFaculty(token)) return true;
  return verifyCourseEntitlement(token.uid, courseId);
};
