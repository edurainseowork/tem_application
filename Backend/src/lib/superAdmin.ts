import type { DecodedIdToken } from "firebase-admin/auth";

// The one account allowed to create and delete CMS admins. This is the only place the
// address is configured; the CMS learns whether the signed-in user is the Super Admin
// from GET /api/auth/me. Override with SUPER_ADMIN_EMAIL if the address ever changes.
export const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "edurainseowork@gmail.com").trim().toLowerCase();

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isSuperAdminEmail = (email: string | null | undefined): boolean =>
  !!email && normalizeEmail(email) === SUPER_ADMIN_EMAIL;

/**
 * True only for a verified Firebase ID token of the Super Admin. The email must be verified:
 * otherwise anyone who registered that address before its owner could claim the role.
 */
export const isSuperAdminToken = (token: DecodedIdToken | undefined): boolean =>
  !!token && token.email_verified === true && isSuperAdminEmail(token.email);

/** Custom claims that grant CMS access (set by set-admin.mjs or the Manage Admins page). */
export const hasPrivilegedClaims = (claims: Record<string, unknown> | undefined): boolean => {
  if (!claims) return false;
  const role = typeof claims.role === "string" ? claims.role.toLowerCase() : "";
  return claims.admin === true || claims.faculty === true || ["admin", "faculty", "instructor", "teacher"].includes(role);
};