import * as zod from "zod";

// Admin notifications sent from the CMS. Push payloads are capped at 4 KB, so keep them short
export const AdminNotificationBody = zod.object({
  title: zod
    .string({ required_error: "Title is required" })
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be at most 100 characters"),
  description: zod
    .string({ required_error: "Description is required" })
    .trim()
    .min(3, "Description must be at least 3 characters")
    .max(500, "Description must be at most 500 characters"),
});

export type AdminNotificationBody = zod.infer<typeof AdminNotificationBody>;

export const EXPO_PUSH_TOKEN_REGEX = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

export const PushTokenBody = zod.object({
  token: zod.string({ required_error: "Push token is required" }).trim().regex(EXPO_PUSH_TOKEN_REGEX, "Invalid Expo push token"),
  platform: zod.enum(["android", "ios"]).optional(),
});

export type PushTokenBody = zod.infer<typeof PushTokenBody>;

// Notification images: PNG/JPEG/WEBP up to 1 MB (Android drops larger big-picture images)
export const NOTIFICATION_IMAGE_MAX_BYTES = 1024 * 1024;
