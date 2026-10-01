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

const courseFields = {
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(10).max(5000),
  price: paise,
  originalPrice: paise.nullable(),
  thumbnail,
  categoryId: z.number().int().positive(),
  isPublished: z.boolean(),
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
