import * as zod from "zod";

// Tests / examinations. Used by the CMS (create/edit tests and questions) and the student API (submit).

export const QUESTION_TYPES = [
  "multiple_choice",
  "integer",
  "fill_ups",
  "true_false",
  "comprehension",
  "match_the_following",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// Statuses an admin can pick. PUBLISHED and COMPLETED are worked out from publish/close time.
export const EDITABLE_TEST_STATUSES = ["DRAFT", "SCHEDULED"] as const;
export const TEST_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "COMPLETED", "ARCHIVED"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export const SUBMISSION_REASONS = [
  "MANUAL_SUBMIT",
  "TIME_EXPIRED",
  "CHEATING_APP_MINIMIZED",
  "CHEATING_SCREEN_EXIT",
  "ADMIN_SUBMISSION",
] as const;
export type SubmissionReason = (typeof SUBMISSION_REASONS)[number];

export const VIOLATION_TYPES = ["APP_MINIMIZED", "SCREEN_EXIT"] as const;

export const MAX_TEST_DURATION_MINUTES = 600;
export const MAX_QUESTION_MARKS = 100;
export const MAX_QUESTIONS_PER_TEST = 1000;
export const QUESTION_CSV_MAX_BYTES = 2 * 1024 * 1024;

const dateTime = (label: string) =>
  zod.string({ required_error: `${label} is required` }).datetime({ offset: true, message: `${label} must be a valid date and time` });

const marks = (label: string) =>
  zod.coerce
    .number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(MAX_QUESTION_MARKS, `${label} must be at most ${MAX_QUESTION_MARKS}`);

const optionalText = (max: number) =>
  zod
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

const testFields = {
  title: zod
    .string({ required_error: "Test title is required" })
    .trim()
    .min(3, "Test title must be at least 3 characters")
    .max(200, "Test title must be at most 200 characters"),
  description: optionalText(2000),
  targetBatch: optionalText(100),
  durationMinutes: zod.coerce
    .number({ required_error: "Duration is required", invalid_type_error: "Duration must be a number" })
    .int("Duration must be a whole number of minutes")
    .min(1, "Duration must be greater than 0")
    .max(MAX_TEST_DURATION_MINUTES, `Duration must be at most ${MAX_TEST_DURATION_MINUTES} minutes`),
  marksPositive: marks("Positive marks"),
  marksNegative: marks("Negative marks"),
  publishTime: dateTime("Publish date and time"),
  closeTime: dateTime("Close date and time").optional().nullable().transform((value) => value || null),
  status: zod.enum(EDITABLE_TEST_STATUSES, { errorMap: () => ({ message: "Status must be DRAFT or SCHEDULED" }) }).default("DRAFT"),
};

const closesAfterPublish = (test: { publishTime: string; closeTime: string | null }) =>
  !test.closeTime || new Date(test.closeTime).getTime() > new Date(test.publishTime).getTime();
const closeTimeIssue = { message: "Close time must be after the publish time", path: ["closeTime"] };

export const CreateTestBody = zod
  .object({
    courseId: zod.coerce.number({ required_error: "Course is required", invalid_type_error: "Course is required" }).int().positive("Course is required"),
    ...testFields,
  })
  .refine(closesAfterPublish, closeTimeIssue);
export type CreateTestBody = zod.infer<typeof CreateTestBody>;

// The course of an existing test cannot change (its questions and results belong to it)
export const UpdateTestBody = zod.object(testFields).refine(closesAfterPublish, closeTimeIssue);
export type UpdateTestBody = zod.infer<typeof UpdateTestBody>;

// One question as typed in the CMS. Uses the same fields as a CSV row, so both go through the same checks.
export const TestQuestionBody = zod.object({
  questionOrder: zod.coerce.number({ invalid_type_error: "Question order must be a number" }).int().min(1, "Question order must be 1 or more"),
  type: zod.enum(QUESTION_TYPES, { errorMap: () => ({ message: "Invalid question type" }) }),
  questionText: zod.string({ required_error: "Question text is required" }).trim().min(1, "Question text is required").max(5000),
  passage: optionalText(10000),
  options: zod.array(zod.string().trim().max(1000)).max(4).default([]), // A–D
  matchOptions: zod.array(zod.string().trim().max(1000)).max(10).default([]), // right column for match_the_following
  correctAnswer: zod.string({ required_error: "Correct answer is required" }).trim().min(1, "Correct answer is required").max(1000),
  solution: optionalText(5000),
  marksPositive: marks("Positive marks").optional().nullable(),
  marksNegative: marks("Negative marks").optional().nullable(),
});
export type TestQuestionBody = zod.infer<typeof TestQuestionBody>;

// What a student's app sends. Score, counts and marks are never accepted from the app (unknown keys are dropped).
const studentAnswer = zod.union([
  zod.string().max(1000),
  zod.number(),
  zod.boolean(),
  zod.array(zod.string().max(50)).max(20),
  zod.record(zod.string().max(10), zod.union([zod.string().max(10), zod.number()])),
  zod.null(),
]);

export const SubmitTestBody = zod.object({
  answers: zod
    .array(
      zod.object({
        question_id: zod.number({ required_error: "question_id is required" }).int().positive(),
        my_answer: studentAnswer.optional().default(null),
      }),
    )
    .max(MAX_QUESTIONS_PER_TEST)
    .default([]),
  submission_reason: zod.enum(SUBMISSION_REASONS, { errorMap: () => ({ message: "Invalid submission reason" }) }).default("MANUAL_SUBMIT"),
  violation_count: zod.coerce.number().int().min(0).max(1000).optional(),
});
export type SubmitTestBody = zod.infer<typeof SubmitTestBody>;
export type StudentAnswerValue = zod.infer<typeof studentAnswer>;

export const TestViolationBody = zod.object({
  type: zod.enum(VIOLATION_TYPES, { errorMap: () => ({ message: "Invalid violation type" }) }),
});
