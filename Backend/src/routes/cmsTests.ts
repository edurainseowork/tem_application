import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { coursesTable, testQuestionsTable, testSubmissionsTable, testsTable, userCoursesTable, usersTable, type Test } from "@workspace/db/schema";
import { CreateTestBody, QUESTION_CSV_MAX_BYTES, QUESTION_TYPES, SUBMISSION_REASONS, TEST_STATUSES, TestQuestionBody, UpdateTestBody } from "@workspace/api-zod";
import { requireAdminOrFaculty } from "../middlewares/auth";
import { HttpError, parseId } from "../lib/http-error";
import { logger } from "../lib/logger";
import { firebaseAuth } from "../lib/firebase-admin";
import { buildQuestion } from "../lib/testEvaluation";
import { parseQuestionCsv, questionTemplateCsv, type ParsedUpload } from "../lib/testCsv";
import { notifyTestScheduled } from "../lib/testNotifications";
import { closeExpiredAttempts, finalizeAttempt, loadQuestions, questionCountSql, testStatusSql, type Tx } from "../lib/testAttempts";

// CMS → Tests. Admins and teachers (faculty) only; students get 403.
const router = Router();
router.use(requireAdminOrFaculty);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: QUESTION_CSV_MAX_BYTES, files: 1, fields: 20 },
});

// The CSV arrives as multipart field "file"; plain JSON bodies are accepted too
const parseMultipart = (req: Request, res: Response, next: NextFunction) => {
  if (req.is("multipart/form-data")) {
    upload.single("file")(req, res, next);
    return;
  }
  next();
};

// Multipart sends every field as a string; treat empty fields as "not given"
const formFields = (body: Record<string, unknown> | undefined) =>
  Object.fromEntries(Object.entries(body ?? {}).filter(([, value]) => value !== ""));

const readCsv = (file: Express.Multer.File | undefined): string | null => {
  if (!file) return null;
  if (!/\.csv$/i.test(file.originalname)) throw new HttpError(400, "Upload a .csv file (in Excel: File → Save As → CSV UTF-8)");
  return file.buffer.toString("utf8");
};

const csvFailure = (res: Response, parsed: ParsedUpload) =>
  res.status(400).json({
    error: "Question upload failed. Please fix the highlighted errors and try again.",
    data: { ...parsed, questions: [] },
  });

const testColumns = {
  id: testsTable.id,
  courseId: testsTable.courseId,
  courseTitle: coursesTable.title,
  title: testsTable.title,
  description: testsTable.description,
  targetBatch: testsTable.targetBatch,
  storedStatus: testsTable.status,
  status: testStatusSql,
  publishTime: testsTable.publishTime,
  closeTime: testsTable.closeTime,
  durationMinutes: testsTable.durationMinutes,
  marksPositive: testsTable.marksPositive,
  marksNegative: testsTable.marksNegative,
  createdBy: testsTable.createdBy,
  createdAt: testsTable.createdAt,
  updatedAt: testsTable.updatedAt,
  questionCount: questionCountSql,
  submissionCount: sql<number>`(SELECT count(*)::int FROM test_submissions s WHERE s.test_id = "tests"."id" AND s.status = 'SUBMITTED')`,
};

const findTest = async (id: number) => {
  const [test] = await db.select(testColumns).from(testsTable).innerJoin(coursesTable, eq(testsTable.courseId, coursesTable.id)).where(eq(testsTable.id, id));
  if (!test || test.storedStatus === "ARCHIVED") throw new HttpError(404, "Test not found");
  return test;
};

const hasAttempts = async (testId: number, executor: typeof db | Tx = db) => {
  const [row] = await executor.select({ value: count() }).from(testSubmissionsTable).where(eq(testSubmissionsTable.testId, testId));
  return row.value > 0;
};

// Questions and marking are frozen once a student has started, so every result stays comparable
const assertQuestionsEditable = async (testId: number, executor: typeof db | Tx = db) => {
  if (await hasAttempts(testId, executor)) throw new HttpError(409, "Students have already attempted this test, so its questions can no longer be changed");
};

const insertQuestions = (tx: Tx, testId: number, questions: ParsedUpload["questions"]) =>
  questions.length ? tx.insert(testQuestionsTable).values(questions.map((question) => ({ ...question, testId }))) : Promise.resolve();

const scheduledMessage = (action: string, notified: number, status: string) =>
  status === "SCHEDULED" && notified > 0 ? `${action} · ${notified} enrolled ${notified === 1 ? "student" : "students"} notified` : `${action} successfully`;

// ---- Tests ----

// Course grid on the Tests page: every course with how many tests it has
router.get("/courses", async (_req, res) => {
  const rows = await db
    .select({
      id: coursesTable.id,
      title: coursesTable.title,
      thumbnail: coursesTable.thumbnail,
      category: coursesTable.category,
      isPublished: coursesTable.isPublished,
      // Fully qualified: in a single-table select Drizzle writes columns without the table name,
      // so "id" inside the subquery would mean tests.id instead of courses.id
      testCount: sql<number>`(SELECT count(*)::int FROM tests t WHERE t.course_id = "courses"."id" AND t.status <> 'ARCHIVED')`,
    })
    .from(coursesTable)
    .orderBy(asc(coursesTable.title));
  res.json({ success: true, data: rows });
});

router.get("/template", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="test-questions-template.csv"');
  res.send(questionTemplateCsv());
});

// Check a CSV before a test exists (Create Test popup). Saves nothing.
router.post("/questions/preview", parseMultipart, async (req, res) => {
  const text = readCsv(req.file);
  if (text === null) throw new HttpError(400, "Choose a CSV file to upload");
  res.json({ success: true, data: parseQuestionCsv(text) });
});

router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const courseId = req.query.courseId ? parseId(req.query.courseId) : null;
  const status = typeof req.query.status === "string" && (TEST_STATUSES as readonly string[]).includes(req.query.status) ? req.query.status : null;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";

  const conditions = [status ? sql`${testStatusSql} = ${status}` : ne(testsTable.status, "ARCHIVED")];
  if (courseId) conditions.push(eq(testsTable.courseId, courseId));
  if (search) conditions.push(or(ilike(testsTable.title, `%${search}%`), ilike(coursesTable.title, `%${search}%`))!);
  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db.select(testColumns).from(testsTable).innerJoin(coursesTable, eq(testsTable.courseId, coursesTable.id))
      .where(where).orderBy(desc(testsTable.publishTime), desc(testsTable.id)).limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(testsTable).innerJoin(coursesTable, eq(testsTable.courseId, coursesTable.id)).where(where),
  ]);
  res.json({ success: true, data: rows, pagination: { page, limit, total } });
});

// Create a test, optionally with its questions from a CSV (multipart field "file"), in one transaction
router.post("/", parseMultipart, async (req, res) => {
  const body = CreateTestBody.parse(formFields(req.body));
  const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, body.courseId));
  if (!course) throw new HttpError(400, "Course not found");

  const text = readCsv(req.file);
  const parsed = text === null ? null : parseQuestionCsv(text);
  if (parsed && parsed.errors.length) {
    csvFailure(res, parsed);
    return;
  }
  if (body.status === "SCHEDULED" && !parsed?.questions.length) {
    throw new HttpError(400, "Add at least one question before scheduling the test, or save it as a draft");
  }

  const test = await db.transaction(async (tx) => {
    const [created] = await tx.insert(testsTable).values({
      ...body,
      publishTime: new Date(body.publishTime),
      closeTime: body.closeTime ? new Date(body.closeTime) : null,
      createdBy: req.auth?.email ?? null,
    }).returning();
    await insertQuestions(tx, created.id, parsed?.questions ?? []);
    return created;
  });

  logger.info({ testId: test.id, courseId: test.courseId, questions: parsed?.questions.length ?? 0 }, "Test created");
  // Enrolled students hear about a test once it is scheduled (drafts stay private)
  const notified = test.status === "SCHEDULED" ? await notifyTestScheduled(test) : 0;
  res.status(201).json({ success: true, message: scheduledMessage("Test created", notified, test.status), data: await findTest(test.id), notified });
});

router.get("/:id", async (req, res) => {
  res.json({ success: true, data: await findTest(parseId(req.params.id)) });
});

router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const body = UpdateTestBody.parse(req.body ?? {});
  const current = await findTest(id);

  if (await hasAttempts(id)) {
    // Timing and marking are fixed once students have started; only the descriptive fields can change
    const locked =
      new Date(body.publishTime).getTime() !== current.publishTime.getTime() ||
      body.durationMinutes !== current.durationMinutes ||
      body.marksPositive !== current.marksPositive ||
      body.marksNegative !== current.marksNegative ||
      body.status !== current.storedStatus;
    if (locked) throw new HttpError(409, "Students have already attempted this test. Only the title, description, batch and close time can be changed.");
  }
  if (body.status === "SCHEDULED" && current.questionCount === 0) {
    throw new HttpError(400, "Add at least one question before scheduling the test");
  }

  const [updated] = await db.update(testsTable).set({
    ...body,
    publishTime: new Date(body.publishTime),
    closeTime: body.closeTime ? new Date(body.closeTime) : null,
    updatedAt: new Date(),
  }).where(eq(testsTable.id, id)).returning();
  // A draft that is now scheduled is announced to students (each student is told only once per test)
  const notified = current.storedStatus !== "SCHEDULED" && updated.status === "SCHEDULED" ? await notifyTestScheduled(updated) : 0;
  res.json({ success: true, message: scheduledMessage("Test updated", notified, updated.status), data: await findTest(id), notified });
});

// Tests that students have attempted are archived (results are kept); others are deleted
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  await findTest(id);
  if (await hasAttempts(id)) {
    await db.update(testsTable).set({ status: "ARCHIVED", updatedAt: new Date() }).where(eq(testsTable.id, id));
    res.json({ success: true, message: "Test archived (students have attempted it, so results are kept)", data: { archived: true } });
    return;
  }
  await db.delete(testsTable).where(eq(testsTable.id, id));
  res.json({ success: true, message: "Test deleted", data: { archived: false } });
});

// ---- Questions (with answers: CMS only) ----

router.get("/:id/questions", async (req, res) => {
  const id = parseId(req.params.id);
  await findTest(id);
  const conditions = [eq(testQuestionsTable.testId, id)];
  const type = typeof req.query.type === "string" ? req.query.type : "";
  if ((QUESTION_TYPES as readonly string[]).includes(type)) conditions.push(eq(testQuestionsTable.type, type));
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  if (search) conditions.push(ilike(testQuestionsTable.questionText, `%${search}%`));
  const rows = await db.select().from(testQuestionsTable).where(and(...conditions)).orderBy(asc(testQuestionsTable.questionOrder), asc(testQuestionsTable.id));
  res.json({ success: true, data: rows });
});

const parseQuestionBody = (body: unknown) => {
  const input = TestQuestionBody.parse(body ?? {});
  const built = buildQuestion(input);
  if (!built.ok) throw new HttpError(400, built.errors.join(". "));
  return built.value;
};

const assertOrderFree = async (testId: number, order: number, exceptId?: number) => {
  const [clash] = await db.select({ id: testQuestionsTable.id }).from(testQuestionsTable)
    .where(and(eq(testQuestionsTable.testId, testId), eq(testQuestionsTable.questionOrder, order), exceptId ? ne(testQuestionsTable.id, exceptId) : undefined));
  if (clash) throw new HttpError(409, `Question order ${order} is already used in this test`);
};

router.post("/:id/questions", async (req, res) => {
  const id = parseId(req.params.id);
  await findTest(id);
  const question = parseQuestionBody(req.body);
  await assertQuestionsEditable(id);
  await assertOrderFree(id, question.questionOrder);
  const [created] = await db.insert(testQuestionsTable).values({ ...question, testId: id }).returning();
  res.status(201).json({ success: true, message: "Question added", data: created });
});

const findQuestion = async (questionId: number) => {
  const [question] = await db.select().from(testQuestionsTable).where(eq(testQuestionsTable.id, questionId));
  if (!question) throw new HttpError(404, "Question not found");
  await findTest(question.testId);
  return question;
};

router.put("/questions/:questionId", async (req, res) => {
  const existing = await findQuestion(parseId(req.params.questionId));
  const question = parseQuestionBody(req.body);
  await assertQuestionsEditable(existing.testId);
  await assertOrderFree(existing.testId, question.questionOrder, existing.id);
  const [updated] = await db.update(testQuestionsTable).set({ ...question, updatedAt: new Date() }).where(eq(testQuestionsTable.id, existing.id)).returning();
  res.json({ success: true, message: "Question updated", data: updated });
});

router.delete("/questions/:questionId", async (req, res) => {
  const existing = await findQuestion(parseId(req.params.questionId));
  await assertQuestionsEditable(existing.testId);
  await db.delete(testQuestionsTable).where(eq(testQuestionsTable.id, existing.id));
  res.json({ success: true, message: "Question deleted" });
});

// CSV upload for an existing test. ?mode=preview only checks; ?mode=import saves all rows or none.
// &replace=true replaces the current questions instead of adding to them.
router.post("/:id/questions/upload", parseMultipart, async (req, res) => {
  const id = parseId(req.params.id);
  const test = await findTest(id);
  const text = readCsv(req.file);
  if (text === null) throw new HttpError(400, "Choose a CSV file to upload");
  const replace = req.query.replace === "true";
  const existingOrders = replace ? [] : (await loadQuestions(id)).map((question) => question.questionOrder);
  const parsed = parseQuestionCsv(text, existingOrders);

  if (req.query.mode !== "import") {
    res.json({ success: true, data: parsed });
    return;
  }
  if (parsed.errors.length) {
    csvFailure(res, parsed);
    return;
  }
  await db.transaction(async (tx) => {
    await assertQuestionsEditable(id, tx);
    if (replace) await tx.delete(testQuestionsTable).where(eq(testQuestionsTable.testId, id));
    await insertQuestions(tx, id, parsed.questions);
  });
  logger.info({ testId: id, imported: parsed.questions.length, replace }, "Test questions imported");
  res.json({
    success: true,
    message: `${parsed.questions.length} questions imported into "${test.title}"`,
    data: { ...parsed, questions: [] },
  });
});

// ---- Results ----

const resultColumns = {
  id: testSubmissionsTable.id,
  userId: testSubmissionsTable.userId,
  studentName: usersTable.name,
  studentEmail: usersTable.email,
  studentPhone: usersTable.phone,
  studentFirebaseUid: usersTable.firebaseUid,
  status: testSubmissionsTable.status,
  score: testSubmissionsTable.score,
  correctCount: testSubmissionsTable.correctCount,
  wrongCount: testSubmissionsTable.wrongCount,
  skippedCount: testSubmissionsTable.skippedCount,
  totalQuestions: testSubmissionsTable.totalQuestions,
  startedAt: testSubmissionsTable.startedAt,
  endsAt: testSubmissionsTable.endsAt,
  submittedAt: testSubmissionsTable.submittedAt,
  submissionReason: testSubmissionsTable.submissionReason,
  violationCount: testSubmissionsTable.violationCount,
  reportedViolationCount: testSubmissionsTable.reportedViolationCount,
};
// Phone from the student's profile, else the number they signed up with (stored in Firebase).
// Best effort: results still load if Firebase cannot be reached.
const firebasePhones = async (uids: string[]): Promise<Map<string, string>> => {
  const phones = new Map<string, string>();
  const unique = [...new Set(uids)];
  try {
    for (let i = 0; i < unique.length; i += 100) {
      const { users } = await firebaseAuth.getUsers(unique.slice(i, i + 100).map((uid) => ({ uid })));
      for (const user of users) if (user.phoneNumber) phones.set(user.uid, user.phoneNumber);
    }
  } catch (err) {
    logger.warn({ err }, "Could not load student phone numbers from Firebase");
  }
  return phones;
};

const fillPhones = async <T extends { studentPhone: string | null; studentFirebaseUid: string }>(rows: T[]): Promise<T[]> => {
  const missing = rows.filter((row) => !row.studentPhone).map((row) => row.studentFirebaseUid);
  if (!missing.length) return rows;
  const phones = await firebasePhones(missing);
  return rows.map((row) => ({ ...row, studentPhone: row.studentPhone || phones.get(row.studentFirebaseUid) || null }));
};

// The Firebase uid is only needed for the lookup above; it is not sent to the CMS
const withoutUid = <T extends { studentFirebaseUid: string }>(rows: T[]) => rows.map(({ studentFirebaseUid: _uid, ...row }) => row);
const average = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : 0);

// Leaderboard: highest score first; equal scores share a rank (1, 1, 3) and the earlier submission is listed first
router.get("/:id/results", async (req, res) => {
  const id = parseId(req.params.id);
  const test = await findTest(id);
  await closeExpiredAttempts({ testId: id });

  const attempts = await db.select(resultColumns).from(testSubmissionsTable)
    .innerJoin(usersTable, eq(testSubmissionsTable.userId, usersTable.id))
    .where(eq(testSubmissionsTable.testId, id));
  const submitted = attempts
    .filter((attempt) => attempt.status === "SUBMITTED")
    .sort((a, b) => b.score - a.score || a.submittedAt!.getTime() - b.submittedAt!.getTime());

  const ranked: (typeof submitted[number] & { rank: number })[] = [];
  submitted.forEach((attempt, index) => {
    const previous = ranked[index - 1];
    ranked.push({ ...attempt, rank: previous && previous.score === attempt.score ? previous.rank : index + 1 });
  });

  const [{ enrolled }] = await db.select({ enrolled: sql<number>`count(DISTINCT ${userCoursesTable.userId})::int` }).from(userCoursesTable).where(eq(userCoursesTable.courseId, test.courseId));
  const scores = submitted.map((row) => row.score);
  const stats = {
    totalStudents: enrolled,
    totalSubmissions: submitted.length,
    inProgress: attempts.length - submitted.length,
    averageScore: average(scores),
    highestScore: scores.length ? Math.max(...scores) : 0,
    lowestScore: scores.length ? Math.min(...scores) : 0,
    averageCorrect: average(submitted.map((row) => row.correctCount)),
    averageWrong: average(submitted.map((row) => row.wrongCount)),
    averageSkipped: average(submitted.map((row) => row.skippedCount)),
    completionRate: enrolled ? Math.round((submitted.length / enrolled) * 1000) / 10 : 0,
    totalViolations: submitted.reduce((sum, row) => sum + row.violationCount, 0),
    maxScore: 0,
  };
  const questions = await loadQuestions(id);
  stats.maxScore = questions.reduce((sum, question) => sum + (question.marksPositive ?? test.marksPositive), 0);

  // Filters
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const reason = typeof req.query.reason === "string" && (SUBMISSION_REASONS as readonly string[]).includes(req.query.reason) ? req.query.reason : "";
  const minScore = req.query.minScore !== undefined && req.query.minScore !== "" ? Number(req.query.minScore) : null;
  const maxScore = req.query.maxScore !== undefined && req.query.maxScore !== "" ? Number(req.query.maxScore) : null;
  // A phone search must also see numbers that are only stored in Firebase
  const searchable = search ? await fillPhones(ranked) : ranked;
  let rows = searchable.filter((row) =>
    (!search || [row.studentName, row.studentEmail, row.studentPhone, String(row.userId)].some((value) => value?.toLowerCase().includes(search))) &&
    (!reason || row.submissionReason === reason) &&
    (minScore === null || Number.isNaN(minScore) || row.score >= minScore) &&
    (maxScore === null || Number.isNaN(maxScore) || row.score <= maxScore));
  if (req.query.sort === "time") rows = [...rows].sort((a, b) => a.submittedAt!.getTime() - b.submittedAt!.getTime());

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const inProgress = attempts.filter((attempt) => attempt.status === "IN_PROGRESS");

  res.json({
    success: true,
    data: {
      test,
      stats,
      results: withoutUid(await fillPhones(rows.slice((page - 1) * limit, page * limit))),
      inProgress: withoutUid(await fillPhones(inProgress)),
    },
    pagination: { page, limit, total: rows.length },
  });
});

const findAttempt = async (testId: number, submissionId: number) => {
  const [attempt] = await db.select().from(testSubmissionsTable)
    .where(and(eq(testSubmissionsTable.id, submissionId), eq(testSubmissionsTable.testId, testId)));
  if (!attempt) throw new HttpError(404, "Result not found");
  return attempt;
};

// One student's result with the question-by-question review (student answer vs correct answer)
router.get("/:id/results/:submissionId", async (req, res) => {
  const id = parseId(req.params.id);
  const test = await findTest(id);
  await closeExpiredAttempts({ testId: id });
  const attempt = await findAttempt(id, parseId(req.params.submissionId));
   const [studentRow] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, firebaseUid: usersTable.firebaseUid }).from(usersTable).where(eq(usersTable.id, attempt.userId));
  const { firebaseUid: studentUid, ...studentInfo } = studentRow;
  const student = { ...studentInfo, phone: studentInfo.phone || (await firebasePhones([studentUid])).get(studentUid) || null };

  let rank: number | null = null;
  if (attempt.status === "SUBMITTED") {
    const [{ higher }] = await db.select({ higher: count() }).from(testSubmissionsTable)
      .where(and(eq(testSubmissionsTable.testId, id), eq(testSubmissionsTable.status, "SUBMITTED"), sql`${testSubmissionsTable.score} > ${attempt.score}`));
    rank = higher + 1;
  }

  res.json({
    success: true,
    data: {
      test,
      student,
      rank,
      submission: { ...attempt, results: undefined },
      review: attempt.results ?? [],
    },
  });
});

// Close an attempt that is still in progress (e.g. the student's app crashed). Unanswered questions count as skipped.
router.post("/:id/results/:submissionId/force-submit", async (req, res) => {
  const id = parseId(req.params.id);
  await findTest(id);
  const attempt = await findAttempt(id, parseId(req.params.submissionId));
  if (attempt.status !== "IN_PROGRESS") throw new HttpError(409, "This attempt is already submitted");

  const updated = await db.transaction(async (tx) => {
    const [test] = await tx.select().from(testsTable).where(eq(testsTable.id, id));
    const questions = await loadQuestions(id, tx);
    return finalizeAttempt(tx, { attempt, test: test as Test, questions, rawAnswers: [], normalized: new Map(), reason: "ADMIN_SUBMISSION" });
  });
  if (!updated) throw new HttpError(409, "This attempt is already submitted");
  logger.info({ testId: id, submissionId: attempt.id, by: req.auth?.email }, "Test attempt force-submitted");
  res.json({ success: true, message: "Attempt submitted", data: { ...updated, results: undefined } });
});

export default router;
