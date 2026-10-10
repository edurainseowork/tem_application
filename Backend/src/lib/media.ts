import type { Request } from "express";
import fs from "fs/promises";
import path from "path";
import { logger } from "./logger";

// Lambda's /var/task is read-only; only /tmp is writable (and ephemeral — use S3 for durable files).
export const UPLOAD_DIR = process.env.AWS_LAMBDA_FUNCTION_NAME
  ? "/tmp/uploads"
  : path.join(process.cwd(), "uploads");

// Files written by routes/upload.ts are always "<uuid>.<ext>".
const LOCAL_UPLOAD_RE = /^\/uploads\/[A-Za-z0-9-]+\.(png|jpe?g|webp|pdf)$/;

export function isLocalUploadPath(value: string): boolean {
  return LOCAL_UPLOAD_RE.test(value);
}

/**
 * Stored media paths are server-relative ("/uploads/x.png") so the DB does not
 * depend on which host served the upload. Clients get an absolute URL.
 * Set PUBLIC_BASE_URL (e.g. https://api.edurain.in) in production.
 */
export function toPublicUrl(stored: string, req: Request): string {
  if (!stored.startsWith("/")) return stored;
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? `${req.protocol}://${req.get("host")}`;
  return `${base}${stored}`;
}

/** Best-effort removal of a file we stored under /uploads. Never escapes UPLOAD_DIR. */
export async function deleteLocalUpload(stored: string | null | undefined): Promise<void> {
  if (!stored || !isLocalUploadPath(stored)) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(stored));
  if (path.dirname(filePath) !== UPLOAD_DIR) return;
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn({ err, stored }, "Failed to delete uploaded file");
    }
  }
}
