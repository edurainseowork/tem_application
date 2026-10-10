import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { UserRecord } from "firebase-admin/auth";
import { db, usersTable } from "@workspace/db";
import { firebaseAuth } from "../lib/firebase-admin";
import { HttpError } from "../lib/http-error";
import { logger } from "../lib/logger";
import { SUPER_ADMIN_EMAIL, hasPrivilegedClaims, isSuperAdminEmail } from "../lib/superAdmin";
import { requireSuperAdmin } from "../middlewares/auth";

// /api/cms/admins — Super Admin only (requireSuperAdmin). Admins are ordinary users with the
// admin role (users.role = 'admin' plus the Firebase `admin` claim), exactly like admins set up
// with tools/set-admin.mjs; every other CMS route treats them the same as the Super Admin.
const router = Router();
router.use(requireSuperAdmin);

const CreateAdminBody = z.object({
  email: z.string({ required_error: "Email is required" }).trim().toLowerCase().min(1, "Email is required").max(254).email("Enter a valid email address"),
});

const getFirebaseUser = async (lookup: () => Promise<UserRecord>): Promise<UserRecord | null> => {
  try {
    return await lookup();
  } catch (err) {
    if ((err as { code?: string }).code === "auth/user-not-found") return null;
    throw err;
  }
};

// GET /api/cms/admins — everyone with the admin role
router.get("/", async (req, res) => {
  const rows = await db
    .select({ uid: usersTable.firebaseUid, email: usersTable.email, name: usersTable.name, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(sql`lower(${usersTable.role}) = 'admin'`)
    .orderBy(usersTable.createdAt);

  // Firebase account details (disabled, created, last sign-in) in batches of 100
  const records = new Map<string, UserRecord>();
  for (let i = 0; i < rows.length; i += 100) {
    const result = await firebaseAuth.getUsers(rows.slice(i, i + 100).map((r) => ({ uid: r.uid })));
    for (const user of result.users) records.set(user.uid, user);
  }

  const admins = rows.map((row) => {
    const record = records.get(row.uid);
    const email = record?.email ?? row.email;
    const superAdmin = isSuperAdminEmail(email);
    const self = row.uid === req.auth?.uid;
    return {
      uid: row.uid,
      email,
      name: record?.displayName ?? row.name,
      status: !record ? "NO_ACCOUNT" : record.disabled ? "DISABLED" : record.metadata.lastSignInTime ? "ACTIVE" : "INVITED",
      isSuperAdmin: superAdmin,
      isSelf: self,
      canDelete: !superAdmin && !self,
      createdAt: record?.metadata.creationTime ? new Date(record.metadata.creationTime).toISOString() : row.createdAt,
      lastSignInAt: record?.metadata.lastSignInTime ? new Date(record.metadata.lastSignInTime).toISOString() : null,
    };
  });
  admins.sort((a, b) => Number(b.isSuperAdmin) - Number(a.isSuperAdmin));

  res.json({ data: admins });
});

// POST /api/cms/admins { email } — make this email an admin.
// Creates the Firebase account when it does not exist yet (no password; the CMS then has
// Firebase email a "set your password" link), sets the admin claim and the users.role.
router.post("/", async (req, res) => {
  const { email } = CreateAdminBody.parse(req.body);
  if (isSuperAdminEmail(email)) throw new HttpError(400, "This email already belongs to the Super Admin");

  let record = await getFirebaseUser(() => firebaseAuth.getUserByEmail(email));
  if (record && hasPrivilegedClaims(record.customClaims)) {
    const [row] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.firebaseUid, record.uid)).limit(1);
    if (!row || row.role?.toLowerCase() === "admin") throw new HttpError(409, "This email is already an admin");
  }

  const created = !record;
  if (!record) {
    record = await firebaseAuth.createUser({ email, emailVerified: false });
  }
  await firebaseAuth.setCustomUserClaims(record.uid, { ...(record.customClaims ?? {}), admin: true, role: "admin" });

  // Same users row the auth middleware would create on first sign-in, with the admin role
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`${usersTable.firebaseUid} = ${record.uid} OR lower(${usersTable.email}) = ${email}`)
    .limit(1);
  if (existing) {
    await db.update(usersTable).set({ role: "admin", firebaseUid: record.uid, updatedAt: new Date() }).where(eq(usersTable.id, existing.id));
  } else {
    await db.insert(usersTable).values({ firebaseUid: record.uid, email, name: record.displayName || email.split("@")[0], role: "admin" });
  }

  logger.info({ uid: record.uid, created, by: req.auth?.uid }, "Admin created");
  res.status(201).json({ data: { uid: record.uid, email, createdAccount: created } });
});

// DELETE /api/cms/admins/:uid — remove an admin's CMS access.
// Clears the admin claims, signs them out everywhere and sets users.role back to 'student'.
// Their Firebase account and any other data (purchases, profile) are kept.
router.delete("/:uid", async (req, res) => {
  const uid = String(req.params.uid ?? "");
  if (!/^[\w-]{1,128}$/.test(uid)) throw new HttpError(400, "Invalid admin id");
  if (uid === req.auth?.uid) throw new HttpError(400, "You cannot delete your own account");

  const record = await getFirebaseUser(() => firebaseAuth.getUser(uid));
  const [row] = await db
    .select({ email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, uid))
    .limit(1);

  const email = (record?.email ?? row?.email ?? "").toLowerCase();
  if (isSuperAdminEmail(email) || email === SUPER_ADMIN_EMAIL) throw new HttpError(403, "The Super Admin account cannot be deleted");
  const isAdminNow = row?.role?.toLowerCase() === "admin" || (record ? hasPrivilegedClaims(record.customClaims) : false);
  if (!isAdminNow) throw new HttpError(404, "Admin not found");

  // Firebase first: the old tokens stop working at once (the auth middleware checks revocation
  // for any token that carries admin claims)
  if (record) {
    const { admin: _admin, role: _role, faculty: _faculty, ...otherClaims } = record.customClaims ?? {};
    await firebaseAuth.setCustomUserClaims(uid, otherClaims);
    await firebaseAuth.revokeRefreshTokens(uid);
  }
  await db.update(usersTable).set({ role: "student", updatedAt: new Date() }).where(eq(usersTable.firebaseUid, uid));

  logger.info({ uid, by: req.auth?.uid }, "Admin removed");
  res.json({ data: { uid, email } });
});

export default router;