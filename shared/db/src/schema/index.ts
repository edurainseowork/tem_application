import { pgTable, text, serial, integer, boolean, timestamp, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
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
  usageLimit: integer("usage_limit"), // max redemptions for private coupons; null = unlimited
  usedCount: integer("used_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(), // false once usageLimit is reached
});

// Courses a coupon applies to. A coupon with no rows here (created before course selection existed) applies to every course.
export const couponCoursesTable = pgTable("coupon_courses", {
  couponId: integer("coupon_id").references(() => couponsTable.id, { onDelete: 'cascade' }).notNull(),
  courseId: integer("course_id").references(() => coursesTable.id, { onDelete: 'cascade' }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.couponId, table.courseId] }),
]);

// One row per successful coupon use
export const couponRedemptionsTable = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").references(() => couponsTable.id, { onDelete: 'cascade' }).notNull(),
  courseId: integer("course_id").references(() => coursesTable.id, { onDelete: 'set null' }),
  firebaseUid: text("firebase_uid"),
  razorpayOrderId: text("razorpay_order_id").unique(), // makes payment verification retries idempotent
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

// Live classes are hosted on Google Meet; we only store the link and schedule.
export const liveClassesTable = pgTable("live_classes", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").references(() => coursesTable.id, { onDelete: 'cascade' }).notNull(),
  title: text("title").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  meetUrl: text("meet_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("live_classes_course_id_start_time_idx").on(table.courseId, table.startTime),
]);

// In-app notifications shown to students in the mobile app
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: 'cascade' }).notNull(),
  type: text("type").notNull(), // 'live_class'
  title: text("title").notNull(),
  body: text("body").notNull(),
  liveClassId: integer("live_class_id").references(() => liveClassesTable.id, { onDelete: 'cascade' }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("notifications_user_id_created_at_idx").on(table.userId, table.createdAt),
  // A student is notified about a given live class at most once
  uniqueIndex("notifications_user_id_live_class_id_idx").on(table.userId, table.liveClassId),
]);

// Zod Schemas
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;

export type LiveClass = typeof liveClassesTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
export type Coupon = typeof couponsTable.$inferSelect;
