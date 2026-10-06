import { pgTable, text, serial, integer, boolean, timestamp, jsonb, index, pgEnum, varchar, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  firebaseUid: text("firebase_uid").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  role: varchar("role", { length: 50 }).default("student"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CourseMentor = {
  name: string;
  experience: string | null; // one line, e.g. "15+ years teaching JEE Physics"
  photo: string | null;
};


export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // in paise/cents
  originalPrice: integer("original_price"), // MRP in paise, shown struck-through; null = no discount shown
  thumbnail: text("thumbnail").notNull(), // "/uploads/<file>" or absolute https URL (S3/CDN)
  category: text("category").notNull(), // Denormalised category name, kept in sync with categoryId
  categoryId: integer("category_id").references(() => categoriesTable.id, { onDelete: 'restrict' }),
  isPublished: boolean("is_published").default(false).notNull(),
  publishedAt: timestamp("published_at"),
  vimeoId: text("vimeo_id"), // Protected video
  pdfUrl: text("pdf_url"), // Protected notes
    // Shown on the course page; all optional and managed from the CMS Course Manager
  // One or more mentors: photo is "/uploads/<file>" or an absolute https URL
  mentors: jsonb("mentors").$type<CourseMentor[]>().default([]).notNull(),
  studentsEnrolled: integer("students_enrolled"), // display figure set by admins
  duration: text("duration"), // free text, e.g. "40 hours" or "6 months"
  totalLessons: integer("total_lessons"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("courses_category_id_idx").on(table.categoryId),
  index("courses_is_published_idx").on(table.isPublished),
]);

export const courseContentTypeEnum = pgEnum("course_content_type", [
  "folder",
  "video",
  "pdf",
  "note",
  "quiz",
]);

export const courseContentTable = pgTable("course_content", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()::text`).$defaultFn(() => crypto.randomUUID()),
  courseId: integer("course_id").references(() => coursesTable.id, { onDelete: 'cascade' }).notNull(),
  parentId: text("parent_id"), // null = root level of course; self-referencing foreign key
  title: text("title").notNull(),
  type: courseContentTypeEnum("type").notNull(),
  mediaUrl: text("media_url"), // URL or file path
  fileSize: varchar("file_size", { length: 50 }),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("course_content_course_id_idx").on(table.courseId),
  index("course_content_parent_id_idx").on(table.parentId),
  index("course_content_order_idx").on(table.order),
]);

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
// One row per Razorpay order. The server decides user, course, amount and coupon when the order is
// created; payment verification only trusts this row, never values sent by the app.
export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: 'cascade' }).notNull(),
  courseId: integer("course_id").references(() => coursesTable.id, { onDelete: 'cascade' }).notNull(),
  razorpayOrderId: text("razorpay_order_id").notNull().unique(),
  razorpayPaymentId: text("razorpay_payment_id"),
  amount: integer("amount").notNull(), // paise, after coupon
  currency: text("currency").default("INR").notNull(),
  couponId: integer("coupon_id").references(() => couponsTable.id, { onDelete: 'set null' }),
  status: text("status").default("created").notNull(), // 'created' | 'paid' | 'failed'
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("payments_user_id_idx").on(table.userId),
]);

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

// ---- Admin notifications (separate from live class notifications) ----

// Expo push tokens of the devices each user is signed in on (one row per device)
export const pushTokensTable = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: 'cascade' }).notNull(),
  token: text("token").notNull().unique(),
  platform: text("platform"), // 'android' | 'ios'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("push_tokens_user_id_idx").on(table.userId),
]);

// Notifications an admin sent to every user from the CMS (sidebar → Notifications).
// Every user sees all of them, so one row per notification is enough.
export const adminNotificationsTable = pgTable("admin_notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  sentBy: text("sent_by"),
  recipientCount: integer("recipient_count").default(0).notNull(),
  pushSentCount: integer("push_sent_count").default(0).notNull(),
  pushFailedCount: integer("push_failed_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Zod Schemas
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;

export type Category = typeof categoriesTable.$inferSelect;

export const insertCourseContentSchema = createInsertSchema(courseContentTable);
export type InsertCourseContent = z.infer<typeof insertCourseContentSchema>;
export type CourseContent = typeof courseContentTable.$inferSelect;
export type CourseContentType = (typeof courseContentTypeEnum.enumValues)[number];

export type LiveClass = typeof liveClassesTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
export type Coupon = typeof couponsTable.$inferSelect;
export type AdminNotification = typeof adminNotificationsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
