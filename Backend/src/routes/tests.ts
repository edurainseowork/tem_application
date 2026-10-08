import { Router, type Request } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { coursesTable, testSubmissionsTable, testsTable, userCoursesTable, type TestQuestion, type TestSubmission } from "@workspace/db/schema";
import { SubmitTestBody, TestViolationBody } from "@workspace/api-zod";
import { canAccessCourse, findDbUserId, requireAuth } from "../middlewares/auth.js";
import { HttpError, parseId } from "../lib/http-error";
import { logger } from "../lib/logger";
import { SUBMIT_GRACE_MS, checkAnswers, closeExpiredAttempts, dbNow, finalizeAttempt, loadQuestions, questionCountSql, testStatusSql } from "../lib/testAttempts";

// Student test APIs for the mobile app. The student always comes from the login token;
// correct answers and solutions are never returned before the test closes.
const router = Router();
router.use(requireAuth);

const MAX_VIOLATION_EVENTS = 100;

const studentId = async (req: Request) => {
  const id = await findDbUserId(req.auth!.uid);
  if (!id) throw new HttpError(403, "User not found. Please log in again.");
  return id;
};

const testColumns = {
  id: testsTable.id,
  courseId: testsTable.courseId,
  courseName: coursesTable.title,
  title: testsTable.title,
  description: testsTable.description,
  targetBatch: testsTable.targetBatch,
  status: testStatusSql,
  publishTime: testsTable.publishTime,
  closeTime: testsTable.closeTime,
  durationMinutes: testsTable.durationMinutes,
  marksPositive: testsTable.marksPositive,
  marksNegative: testsTable.marksNegative,
  totalQuestions: questionCountSql,
};

const VISIBLE_STATUSES = ["SCHEDULED", "PUBLISHED", "COMPLETED"];

// The test as a student may see it: not drafts or archived tests, and only for courses they own
const findVisibleTest = async (req: Request, testId: number) => {
  const [test] = await db.select(testColumns).from(testsTable).innerJoin(coursesTable, eq(testsTable.courseId, coursesTable.id)).where(eq(testsTable.id, testId));
  if (!test || !VISIBLE_STATUSES.includes(test.status) || !(await canAccessCourse(req.auth!, test.courseId))) {
    throw new HttpError(404, "Test not found");
  }
  return test;
};

const findAttempt = async (testId: number, userId: number) => {
  const [attempt] = await db.select().from(testSubmissionsTable)
    .where(and(eq(testSubmissionsTable.testId, testId), eq(testSubmissionsTable.userId, userId), eq(testSubmissionsTable.attemptNumber, 1)));
  return attempt ?? null;
};

const attemptSummary = (attempt: TestSubmission | null) =>
  attempt && {
    id: attempt.id,
    status: attempt.status,
    started_at: attempt.startedAt,
    end_at: attempt.endsAt,
    submitted_at: attempt.submittedAt,
    ...(attempt.status === "SUBMITTED" && {
      score: attempt.score,
      correct_count: attempt.correctCount,
      wrong_count: attempt.wrongCount,
      skipped_count: attempt.skippedCount,
      total_questions: attempt.totalQuestions,
      submission_reason: attempt.submissionReason,
    }),
  };

// Question as the app needs it: no correct answer, no solution
const studentQuestion = (question: TestQuestion, defaults: { marksPositive: number; marksNegative: number }) => ({
  id: question.id,
  question_order: question.questionOrder,
  type: question.type,
  question_text: question.questionText,
  passage: question.passage,
  options: question.options,
  // Lets the app show checkboxes instead of radio buttons; the answer itself is never sent
  multiple_correct: (question.type === "multiple_choice" || question.type === "comprehension") && question.correctAnswer.includes(","),
  marks_positive: question.marksPositive ?? defaults.marksPositive,
  marks_negative: question.marksNegative ?? defaults.marksNegative,
});

// Published and upcoming tests for the courses this student owns
router.get("/", async (req, res) => {
  const userId = await studentId(req);
  await closeExpiredAttempts({ userId });
  const owned = (await db.selectDistinct({ courseId: userCoursesTable.courseId }).from(userCoursesTable).where(eq(userCoursesTable.userId, userId))).map((row) => row.courseId);
  const courseId = req.query.courseId ? parseId(req.query.courseId) : null;
  const courseIds = courseId ? owned.filter((id) => id === courseId) : owned;
  if (courseIds.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }

  const tests = await db.select(testColumns).from(testsTable).innerJoin(coursesTable, eq(testsTable.courseId, coursesTable.id))
    .where(and(inArray(testsTable.courseId, courseIds), sql`${testStatusSql} IN ('SCHEDULED', 'PUBLISHED', 'COMPLETED')`))
    .orderBy(desc(testsTable.publishTime));
  const attempts = tests.length
    ? await db.select().from(testSubmissionsTable).where(and(eq(testSubmissionsTable.userId, userId), inArray(testSubmissionsTable.testId, tests.map((test) => test.id))))
    : [];
  res.json({
    success: true,
    data: tests.map((test) => ({ ...test, myAttempt: attemptSummary(attempts.find((attempt) => attempt.testId === test.id) ?? null) })),
  });
});

router.get("/:testId", async (req, res) => {
  const userId = await studentId(req);
  const test = await findVisibleTest(req, parseId(req.params.testId));
  await closeExpiredAttempts({ testId: test.id, userId });
  res.json({ success: true, data: { ...test, myAttempt: attemptSummary(await findAttempt(test.id, userId)) } });
});

// Starts the server-side timer. Calling it again returns the same attempt (no restart, no second attempt).
router.post("/:testId/start", async (req, res) => {
  const userId = await studentId(req);
  const test = await findVisibleTest(req, parseId(req.params.testId));
  await closeExpiredAttempts({ testId: test.id, userId });

  let attempt = await findAttempt(test.id, userId);
  if (attempt?.status === "SUBMITTED") throw new HttpError(409, "You have already submitted this test");
  if (!attempt) {
    if (test.status === "SCHEDULED") throw new HttpError(403, "This test has not started yet");
    if (test.status === "COMPLETED") throw new HttpError(403, "This test is closed");
    if (test.totalQuestions === 0) throw new HttpError(403, "This test has no questions yet");

    // Deadline = start + duration, but never after the test's close time
    await db.insert(testSubmissionsTable).values({
      testId: test.id,
      userId,
      attemptNumber: 1,
      totalQuestions: test.totalQuestions,
      endsAt: test.closeTime
        ? sql`LEAST(now() + make_interval(mins => ${test.durationMinutes}::int), ${test.closeTime.toISOString()}::timestamptz)`
        : sql`now() + make_interval(mins => ${test.durationMinutes}::int)`,
    }).onConflictDoNothing();
    attempt = (await findAttempt(test.id, userId))!;
    logger.info({ testId: test.id, userId }, "Test started");
  }

  res.json({
    success: true,
    data: {
      test_id: test.id,
      course_name: test.courseName,
      test_title: test.title,
      duration_minutes: test.durationMinutes,
      total_questions: test.totalQuestions,
      started_at: attempt.startedAt,
      end_at: attempt.endsAt,
      server_time: await dbNow(),
    },
  });
});

const activeAttempt = async (testId: number, userId: number) => {
  await closeExpiredAttempts({ testId, userId });
  const attempt = await findAttempt(testId, userId);
  if (!attempt) throw new HttpError(403, "Start the test first");
  if (attempt.status !== "IN_PROGRESS") throw new HttpError(409, "You have already submitted this test");
  return attempt;
};

// Questions are only available during the student's own attempt
router.get("/:testId/questions", async (req, res) => {
  const userId = await studentId(req);
  const test = await findVisibleTest(req, parseId(req.params.testId));
  const attempt = await activeAttempt(test.id, userId);
  const questions = await loadQuestions(test.id);
  res.json({
    success: true,
    data: {
      test_id: test.id,
      end_at: attempt.endsAt,
      server_time: await dbNow(),
      // So a resumed test continues the "left the app" count instead of starting from zero
      violation_count: attempt.violationCount,
      questions: questions.map((question) => studentQuestion(question, test)),
    },
  });
});

// Anti-cheat events are counted and timestamped by the server (the app cannot lower the count)
router.post("/:testId/violations", async (req, res) => {
  const { type } = TestViolationBody.parse(req.body ?? {});
  const userId = await studentId(req);
  const test = await findVisibleTest(req, parseId(req.params.testId));
  const attempt = await activeAttempt(test.id, userId);
  const [updated] = await db.update(testSubmissionsTable)
    .set({
      violationCount: sql`${testSubmissionsTable.violationCount} + 1`,
      violations: sql`CASE WHEN jsonb_array_length(${testSubmissionsTable.violations}) < ${MAX_VIOLATION_EVENTS}
        THEN ${testSubmissionsTable.violations} || jsonb_build_array(jsonb_build_object('type', ${type}::text, 'at', now()))
        ELSE ${testSubmissionsTable.violations} END`,
    })
    .where(and(eq(testSubmissionsTable.id, attempt.id), eq(testSubmissionsTable.status, "IN_PROGRESS")))
    .returning({ violationCount: testSubmissionsTable.violationCount });
  res.json({ success: true, data: { violation_count: updated?.violationCount ?? attempt.violationCount } });
});

// Marks the answers on the server. Any score or counts sent by the app are ignored.
router.post("/:testId/submit", async (req, res) => {
  const body = SubmitTestBody.parse(req.body ?? {});
  if (body.submission_reason === "ADMIN_SUBMISSION") throw new HttpError(400, "Invalid submission reason");
  const userId = await studentId(req);
  const test = await findVisibleTest(req, parseId(req.params.testId));

  const outcome = await db.transaction(async (tx) => {
    // Lock the attempt so parallel submits (double tap, retry, second device) run one after another
    const [attempt] = await tx.select().from(testSubmissionsTable)
      .where(and(eq(testSubmissionsTable.testId, test.id), eq(testSubmissionsTable.userId, userId), eq(testSubmissionsTable.attemptNumber, 1)))
      .for("update");
    if (!attempt) throw new HttpError(403, "Start the test first");
    if (attempt.status === "SUBMITTED") return { kind: "already" as const, attempt };

    const [fullTest] = await tx.select().from(testsTable).where(eq(testsTable.id, test.id));
    const questions = await loadQuestions(test.id, tx);
    const now = await dbNow(tx);

    // Too late (beyond the grace period): close the attempt without counting these answers
    if (now.getTime() > attempt.endsAt.getTime() + SUBMIT_GRACE_MS) {
      const closed = await finalizeAttempt(tx, { attempt, test: fullTest, questions, rawAnswers: [], normalized: new Map(), reason: "TIME_EXPIRED", submittedAt: attempt.endsAt });
      return { kind: "expired" as const, attempt: closed! };
    }

    const { errors, normalized } = checkAnswers(questions, body.answers);
    if (errors.length) return { kind: "invalid" as const, errors };

    const submitted = await finalizeAttempt(tx, {
      attempt,
      test: fullTest,
      questions,
      rawAnswers: body.answers,
      normalized,
      reason: body.submission_reason,
      reportedViolationCount: body.violation_count,
    });
    return { kind: "submitted" as const, attempt: submitted! };
  });

  if (outcome.kind === "invalid") {
    res.status(400).json({ error: "Some answers are invalid", issues: outcome.errors.map((e) => ({ path: `question_id ${e.question_id}`, message: e.message })) });
    return;
  }
  if (outcome.kind === "expired") {
    res.status(409).json({ error: "Time is over. Your test was closed when the time ran out.", data: attemptSummary(outcome.attempt) });
    return;
  }
  if (outcome.kind === "submitted") logger.info({ testId: test.id, userId, score: outcome.attempt.score, reason: outcome.attempt.submissionReason }, "Test submitted");
  res.json({
    success: true,
    message: outcome.kind === "already" ? "Test already submitted" : "Test submitted successfully",
    alreadySubmitted: outcome.kind === "already",
    data: attemptSummary(outcome.attempt),
  });
});

// The student's own result. Correct answers are shown only after the test's close time,
// so they cannot be shared with students who are still writing.
router.get("/:testId/result", async (req, res) => {
  const userId = await studentId(req);
  const test = await findVisibleTest(req, parseId(req.params.testId));
  await closeExpiredAttempts({ testId: test.id, userId });
  const attempt = await findAttempt(test.id, userId);
  if (!attempt || attempt.status !== "SUBMITTED") throw new HttpError(404, "No submitted result for this test");

  const showAnswers = test.status === "COMPLETED";
  res.json({
    success: true,
    data: {
      test_id: test.id,
      course_name: test.courseName,
      test_title: test.title,
      ...attemptSummary(attempt),
      answers_available: showAnswers,
      review: showAnswers ? attempt.results : null,
    },
  });
});

export default router;
