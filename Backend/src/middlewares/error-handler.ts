import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { HttpError } from "../lib/http-error";
import { logger } from "../lib/logger";

// Express 5 forwards rejected promises from async handlers here, so routes can just throw.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : "Invalid upload";
    res.status(400).json({ error: message });
    return;
  }
  // Malformed JSON body from express.json()
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large" });
    return;
  }
  // Postgres unique violation (drizzle wraps driver errors in DrizzleQueryError.cause)
  if (pgErrorCode(err) === "23505") {
    res.status(409).json({ error: "A record with the same value already exists" });
    return;
  }
  // Postgres foreign-key violation (e.g. a row became referenced mid-request)
  if (pgErrorCode(err) === "23503") {
    res.status(409).json({ error: "This record is still referenced by other data" });
    return;
  }

  // Client errors raised by Express internals (e.g. static file 403/404)
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 404 ? "Not found" : "Bad request" });
    return;
  }

  // Never leak internals (SQL, stack traces) to clients.
  logger.error({ err, path: req.originalUrl }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e.code === "string") return e.code;
  if (typeof e.cause?.code === "string") return e.cause.code;
  return undefined;
}
