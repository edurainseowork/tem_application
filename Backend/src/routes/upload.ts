import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { requireAdmin } from "../middlewares/auth";
import { rateLimit } from "../middlewares/security";
import { HttpError } from "../lib/http-error";
import { UPLOAD_DIR } from "../lib/media";
import { logger } from "../lib/logger";

const router = Router();

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Files are kept in memory so their real type can be checked before anything touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024, // 500 KB limit
    files: 1,
    fields: 5,
  },
});

// Identify the file by its magic bytes — the client-supplied name and MIME type are not trusted,
// so an attacker cannot store e.g. an .html/.svg file and get it served from our origin.
function detectFileType(buf: Buffer): "png" | "jpg" | "webp" | "pdf" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "pdf";
  return null;
}

// POST /api/upload  (multipart field "image"; png/jpg/webp/pdf; admin only)
router.post(
  "/",
  rateLimit({ windowMs: 60_000, max: 30 }),
  requireAdmin,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) throw new HttpError(400, "No file uploaded");

    const ext = detectFileType(req.file.buffer);
    if (!ext) throw new HttpError(400, "Only PNG, JPEG, WEBP images or PDF files are allowed");

    const filename = `${crypto.randomUUID()}.${ext}`;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), req.file.buffer, { flag: "wx" });

    logger.info({ adminUid: req.auth?.uid, filename, size: req.file.size }, "File uploaded");
    res.status(201).json({ success: true, url: `/uploads/${filename}`, type: ext });
  },
);

export default router;
