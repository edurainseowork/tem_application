import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
  boolean,
  serial,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Courses Table
export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  price: integer("price"),
  originalPrice: integer("original_price"),
  thumbnail: text("thumbnail"),
  category: varchar("category", { length: 255 }),
  categoryId: integer("category_id"),
  isPublished: boolean("is_published").default(false).notNull(),
  publishedAt: timestamp("published_at"),
  vimeoId: text("vimeo_id"),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Course Content Table with Nested Hierarchy Support
export const course_content = pgTable(
  "course_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    course_id: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    parent_id: uuid("parent_id").references((): AnyPgColumn => course_content.id, {
      onDelete: "cascade",
    }), // self-referencing foreign key for nested folders/sections, nullable
    title: varchar("title", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(), // 'folder' | 'video' | 'pdf' | 'note' | 'quiz'
    media_url: text("media_url"),
    file_size: varchar("file_size", { length: 50 }),
    order: integer("order").notNull().default(0),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("course_content_course_id_parent_id_idx").on(
      table.course_id,
      table.parent_id,
    ),
    index("course_content_course_id_order_idx").on(
      table.course_id,
      table.order,
    ),
  ],
);

// Users Table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firebaseUid: text("firebase_uid").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  role: varchar("role", { length: 50 }).default("student"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Categories Table
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Coupons Table
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountPercent: integer("discount_percent").notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
});

// Banners Table
export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User Courses Table
export const userCourses = pgTable("user_courses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  courseId: integer("course_id").notNull(),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
});

// Export aliases for backwards and naming consistency
export const courseContent = course_content;
export const courseContentTable = course_content;
export const coursesTable = courses;
export const usersTable = users;
export const categoriesTable = categories;
export const couponsTable = coupons;
export const bannersTable = banners;
export const userCoursesTable = userCourses;

// Export types
export type CourseContent = typeof course_content.$inferSelect;
export type NewCourseContent = typeof course_content.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
