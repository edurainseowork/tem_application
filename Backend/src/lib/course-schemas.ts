import { z } from "zod";
import { isLocalUploadPath } from "./media";

// Prices are integers in paise (₹1 = 100). Upper bound: ₹10,00,000.
const paise = z.number().int("Price must be in whole paise").min(0).max(100_000_000);

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((v) => v.startsWith("https://"), "URL must use https");

const thumbnail = z
  .string()
  .trim()
  .refine(
    (v) => (isLocalUploadPath(v) && !v.endsWith(".pdf")) || httpsUrl.safeParse(v).success,
    "Thumbnail must be an uploaded image (/uploads/...) or an https URL",
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

const optionalCount = z.number().int().min(0).max(10_000_000).nullable();


// The CMS sends back the photo URLs it was given (absolute, e.g. http://host/uploads/x.png);
// store our own uploads as server-relative paths again.
const OWN_UPLOAD_URL_RE = /^https?:\/\/[^/]+(\/uploads\/[A-Za-z0-9-]+\.(?:png|jpe?g|webp))$/;
const mentorPhoto = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().replace(OWN_UPLOAD_URL_RE, "$1") : v),
  thumbnail.nullable(),
);

const mentor = z
  .object({
    name: z.string().trim().min(1, "Mentor name is required").max(80),
    experience: optionalText(120).default(null),
    photo: mentorPhoto.default(null),
  })
  .strict();

const courseFields = {
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  price: paise,
  originalPrice: paise.nullable(),
  thumbnail,
  categoryId: z.number().int().positive(),
  isPublished: z.boolean(),
  mentors: z.array(mentor).max(10),
  studentsEnrolled: optionalCount,
  duration: optionalText(40),
  totalLessons: optionalCount,
};


function originalPriceNotBelowPrice(v: { price?: number; originalPrice?: number | null }) {
  return v.originalPrice == null || v.price === undefined || v.originalPrice >= v.price;
}
const originalPriceIssue = {
  message: "Original price must be greater than or equal to the selling price",
  path: ["originalPrice"],
};

export const createCourseSchema = z
  .object({
    ...courseFields,
    originalPrice: courseFields.originalPrice.optional(),
    isPublished: courseFields.isPublished.default(false),
        mentors: courseFields.mentors.default([]),
    studentsEnrolled: courseFields.studentsEnrolled.optional(),
    duration: courseFields.duration.optional(),
    totalLessons: courseFields.totalLessons.optional(),
  })
  .strict()
  .refine(originalPriceNotBelowPrice, originalPriceIssue);

export const updateCourseSchema = z
  .object(courseFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
  .refine(originalPriceNotBelowPrice, originalPriceIssue);

export const publishSchema = z.object({ isPublished: z.boolean() }).strict();

export const adminCourseQuerySchema = z.object({
  status: z.enum(["all", "published", "draft"]).default("all"),
  categoryId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});

export const publicCourseQuerySchema = z.object({
  category: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain a-z, 0-9 and single dashes");

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    slug: slug.optional(),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    slug,
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}