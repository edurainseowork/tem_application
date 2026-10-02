import * as zod from "zod";

// Standard Meet meeting code, e.g. https://meet.google.com/abc-defg-hij (an optional query string such as ?authuser=1 is allowed)
export const GOOGLE_MEET_URL_REGEX = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?[^\s#]*)?$/;

export const MAX_LIVE_CLASS_DURATION_MS = 12 * 60 * 60 * 1000;

// Accepts "meet.google.com/..." without a scheme and upgrades http:// to https://
export const normalizeMeetUrl = (value: string): string => {
  const trimmed = value.trim();
  if (/^meet\.google\.com\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed.replace(/^http:\/\//i, "https://");
};

export const CreateLiveClassBody = zod
  .object({
    title: zod
      .string({ required_error: "Title is required" })
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(150, "Title must be at most 150 characters"),
    startTime: zod
      .string({ required_error: "Start time is required" })
      .datetime({ offset: true, message: "Start time must be an ISO 8601 date-time" }),
    endTime: zod
      .string({ required_error: "End time is required" })
      .datetime({ offset: true, message: "End time must be an ISO 8601 date-time" }),
    meetUrl: zod
      .string({ required_error: "Google Meet link is required" })
      .transform(normalizeMeetUrl)
      .pipe(
        zod.string().regex(GOOGLE_MEET_URL_REGEX, "Enter a valid Google Meet link, e.g. https://meet.google.com/abc-defg-hij"),
      ),
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startTime).getTime();
    const end = new Date(value.endTime).getTime();
    if (end <= start) {
      ctx.addIssue({ code: zod.ZodIssueCode.custom, path: ["endTime"], message: "End time must be after the start time" });
      return;
    }
    if (end - start > MAX_LIVE_CLASS_DURATION_MS) {
      ctx.addIssue({ code: zod.ZodIssueCode.custom, path: ["endTime"], message: "A live class can be at most 12 hours long" });
    }
    if (end <= Date.now()) {
      ctx.addIssue({ code: zod.ZodIssueCode.custom, path: ["endTime"], message: "This live class would already be over" });
    }
  });

export type CreateLiveClassBody = zod.infer<typeof CreateLiveClassBody>;

export type LiveClassStatus = "live" | "upcoming" | "ended";

export const getLiveClassStatus = (startTime: Date | string, endTime: Date | string, now: number = Date.now()): LiveClassStatus => {
  if (now >= new Date(endTime).getTime()) return "ended";
  if (now >= new Date(startTime).getTime()) return "live";
  return "upcoming";
};