import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authenticateToken, requireAdminOrFaculty } from "../middleware/auth";
import { rateLimit } from "../middlewares/security";
import { HttpError } from "../lib/http-error";
import { UPLOAD_DIR } from "../lib/media";
import { logger } from "../lib/logger";
import { uploadPublicImage } from "../lib/s3";

const router = Router();

// Ensure local uploads directory exists (for legacy/local thumbnail uploads)
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multipart storage for CMS local uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024, // 500 KB limit for images
    files: 1,
    fields: 5,
  },
});

// Allowed MIME types for S3 media asset uploads (PRD Section 6.3, 6.5, 11)
const ALLOWED_MEDIA_TYPES = new Set([
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
]);

// AWS S3 Configuration strictly from environment variables
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";
const bucket = process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET || "edurain-media-assets";

// AWS S3 Client initialization with secure backend credentials
const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test-access-key-id",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test-secret-access-key",
    ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
  },
});

function detectFileType(buf: Buffer): "png" | "jpg" | "webp" | "pdf" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "pdf";
  return null;
}

/**
 * POST /api/upload
 * 
 * 1. S3 Presigned URL Endpoint (JSON Body):
 *    - Middleware: authenticateToken, requireAdminOrFaculty
 *    - Body: { fileName: string, fileType: string, courseId: string }
 *    - Generates 15-minute short-lived PUT URL for S3 upload
 * 
 * 2. Legacy / Multipart Upload:
 *    - Accepts multipart/form-data for CMS thumbnails / banners
 */
router.post(
  "/",
  rateLimit({ windowMs: 60_000, max: 60 }),
  authenticateToken,
  requireAdminOrFaculty,
  (req: Request, res: Response, next: NextFunction): void => {
    if (req.is("multipart/form-data")) {
      upload.single("image")(req, res, next);
      return;
    }
    next();
  },
  async (req: Request, res: Response): Promise<void> => {
    // 1. Handle Multipart Upload (CMS-Portal thumbnails/banners)
    if (req.file) {
      const ext = detectFileType(req.file.buffer);
      if (!ext) throw new HttpError(400, "Only PNG, JPEG, WEBP images or PDF files are allowed");
      
      // Images (course thumbnails, mentor photos, banners) go to S3 so they survive redeploys and
      // are served by S3 instead of this server. Falls back to local disk when S3 is not configured.
      if (ext !== "pdf" && process.env.AWS_S3_BUCKET_NAME) {
        try {
          const url = await uploadPublicImage(req.file.buffer, ext, "images");
          logger.info({ adminUid: req.auth?.uid, url, size: req.file.size }, "Image uploaded to S3");
          res.status(201).json({ success: true, url, type: ext });
          return;
        } catch (err) {
          logger.error({ err }, "S3 image upload failed, storing locally instead");
        }
      }

      const filename = `${crypto.randomUUID()}.${ext}`;
      await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), req.file.buffer, { flag: "wx" });

      logger.info({ adminUid: req.auth?.uid, filename, size: req.file.size }, "File uploaded locally");
      res.status(201).json({ success: true, url: `/uploads/${filename}`, type: ext });
      return;
    }

    // 2. Handle S3 Presigned URL Generation (JSON request)
    const { fileName, fileType, courseId } = req.body || {};

    if (!fileName || typeof fileName !== "string" || !fileName.trim()) {
      res.status(400).json({ error: "fileName is required and must be a non-empty string" });
      return;
    }

    if (!fileType || typeof fileType !== "string" || !fileType.trim()) {
      res.status(400).json({ error: "fileType is required and must be a non-empty string" });
      return;
    }

    if (!courseId || (typeof courseId !== "string" && typeof courseId !== "number")) {
      res.status(400).json({ error: "courseId is required" });
      return;
    }

    // Validate MIME types: Allow application/pdf and standard video types
    const normalizedFileType = fileType.toLowerCase().trim().split(";")[0];
    if (!ALLOWED_MEDIA_TYPES.has(normalizedFileType)) {
      res.status(400).json({
        error: "Invalid file type. Allowed types: application/pdf, video/mp4, video/quicktime, video/x-matroska",
      });
      return;
    }

    // Sanitize courseId and fileName (prevent leading/trailing slashes, invalid chars, and path traversal)
    const cleanCourseId = String(courseId)
      .trim()
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const cleanFileName = path.basename(fileName.trim()).replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `courses/${cleanCourseId}/${Date.now()}-${cleanFileName}`.replace(/^\/+/, "");

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: normalizedFileType,
      });

      // Generate a short-lived PUT URL (expiration: 15 minutes = 900 seconds)
      const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 15 * 60,
      });

      const fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

      logger.info(
        { uid: req.auth?.uid, courseId, key, fileType: normalizedFileType },
        "Generated S3 presigned upload URL",
      );

      // Return strictly the presigned URL metadata, NEVER leaking IAM secrets
      res.status(200).json({
        uploadUrl,
        key,
        fileUrl,
      });
    } catch (err) {
      logger.error({ err, key }, "Failed to generate S3 presigned URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

export default router;
