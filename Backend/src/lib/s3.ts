import crypto from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Dedicated bucket for admin notification images (AWS_S3_BUCKET_NOTIFICATION in .env), separate from the
// course media bucket used by routes/upload.ts. Objects must be publicly readable: phones download
// push notification images without credentials.
const region = process.env.AWS_REGION || "ap-south-1";
const bucket = process.env.AWS_S3_BUCKET_NAME;

let client: S3Client | null = null;
const getClient = () => {
  client ??= new S3Client({
    region,
    // Reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or an IAM role on Lambda) from the environment
  });
  return client;
};

export type ImageType = "png" | "jpg" | "webp";

const CONTENT_TYPES: Record<ImageType, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

// Checks the file's magic bytes rather than trusting its name or MIME type
export function detectImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Uploads an image under `<folder>/<uuid>.<ext>` and returns its public HTTPS URL. */
export async function uploadPublicImage(buffer: Buffer, type: ImageType, folder: string): Promise<string> {
  if (!bucket) throw new Error("AWS_S3_BUCKET_NAME is not set");
  const key = `${folder}/${crypto.randomUUID()}.${type}`;
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: CONTENT_TYPES[type],
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
