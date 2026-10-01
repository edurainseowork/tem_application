import type { Request, Response, NextFunction } from "express";
import type { CorsOptions } from "cors";

const isProduction = process.env.NODE_ENV === "production";

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // Thumbnails are rendered by the CMS (another origin) and the mobile app.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

/** JSON API responses never need to load anything. */
export function apiContentSecurityPolicy(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Cache-Control", "no-store");
  next();
}

/**
 * CORS_ORIGINS is a comma-separated allow-list, e.g. "https://cms.edurain.in".
 * Native mobile requests send no Origin header and are always allowed (CORS is a
 * browser control; real protection is the bearer token). Without CORS_ORIGINS,
 * every origin is allowed in development and none in production.
 */
export function corsOptions(): CorsOptions {
  const allowList = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowList.includes(origin)) return callback(null, true);
      if (!isProduction && allowList.length === 0) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  };
}

/**
 * Small fixed-window, per-IP rate limiter. It is per process, so on Lambda it only
 * blunts bursts within one instance — also configure API Gateway throttling.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: "Too many requests, please try again later" });
      return;
    }
    next();
  };
}
