import type { Request, Response, NextFunction } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { firebaseAuth } from "../lib/firebase-admin";
import { logger } from "../lib/logger";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: DecodedIdToken;
    }
  }
}

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

async function verify(req: Request, checkRevoked: boolean): Promise<DecodedIdToken | null> {
  const token = readBearerToken(req);
  if (!token) return null;
  try {
    return await firebaseAuth.verifyIdToken(token, checkRevoked);
  } catch (err) {
    logger.warn({ code: (err as { code?: string }).code }, "Rejected Firebase ID token");
    return null;
  }
}

export function isAdmin(token: DecodedIdToken | undefined): boolean {
  // Admin rights come ONLY from a server-set custom claim (see Backend/tools/set-admin.mjs).
  // Never trust an email list or a query/body flag sent by the client.
  return token?.admin === true;
}

/** Any signed-in Firebase user. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const decoded = await verify(req, false);
  if (!decoded) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.auth = decoded;
  next();
}

/** Signed-in user holding the `admin: true` custom claim. Revoked sessions are rejected. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const decoded = await verify(req, true);
  if (!decoded) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!isAdmin(decoded)) {
    logger.warn({ uid: decoded.uid, path: req.originalUrl }, "Non-admin attempted admin route");
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  req.auth = decoded;
  next();
}
