import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  firebaseUid: text("firebase_uid").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // in paise/cents
  thumbnail: text("thumbnail").notNull(), // S3 URL
  category: text("category").notNull(), // JEE, NEET, Foundation, etc.
  vimeoId: text("vimeo_id"), // Protected video
  pdfUrl: text("pdf_url"), // Protected notes
});

export const courseContentTable = pgTable("course_content", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").references(() => coursesTable.id, { onDelete: 'cascade' }).notNull(),
  parentId: integer("parent_id"), // null = root level of course
  type: text("type").notNull(), // 'folder', 'pdf', 'video'
  title: text("title").notNull(),
  url: text("url"), // file path or Vimeo URL
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountPercent: integer("discount_percent").notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
});

export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userCoursesTable = pgTable("user_courses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  courseId: integer("course_id").references(() => coursesTable.id).notNull(),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
});

// Zod Schemas
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;