export const DESK_ROLES = ["mentor", "teacher_assistant"] as const;
export type DeskRole = (typeof DESK_ROLES)[number];

/** Roles the Super Admin can invite from the CMS. */
export const INVITABLE_ROLES = ["admin", ...DESK_ROLES] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_LABELS: Record<InvitableRole, string> = {
  admin: "Admin",
  mentor: "Mentor",
  teacher_assistant: "Teacher Assistance",
};

export const isDeskRole = (role: unknown): role is DeskRole =>
  typeof role === "string" && (DESK_ROLES as readonly string[]).includes(role.trim().toLowerCase());

/** API prefix (inside /api) each desk role may call, besides GET /api/auth/me. */
export const DESK_API_PREFIX: Record<DeskRole, string> = {
  mentor: "/mentor-desk",
  teacher_assistant: "/teacher-assistant-desk",
};

/** The desk role carried by Firebase custom claims, if any (claims are set only by the backend). */
export const deskRoleFromClaims = (claims: Record<string, unknown> | undefined): DeskRole | null => {
  const role = typeof claims?.role === "string" ? claims.role.trim().toLowerCase() : "";
  return isDeskRole(role) ? role : null;
};
