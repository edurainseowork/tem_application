import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { testQuestionsTable, testSubmissionsTable, testsTable, type Test, type TestQuestion, type TestSubmission } from "@workspace/db/schema";
import type { StudentAnswerValue, SubmissionReason } from "@workspace/api-zod";
import { gradeAnswer, normalizeStudentAnswer, roundMarks, type AnswerStatus } from "./testEvaluation";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

// A submission that arrives this long after the deadline still counts (slow networks, retries)
export const SUBMIT_GRACE_MS = 2 * 60 * 1000;

// Live status worked out by the database clock: no cron job and no manual lock/unlock
export const testStatusSql = sql<string>`CASE
  WHEN ${testsTable.status} = 'ARCHIVED' THEN 'ARCHIVED'
  WHEN ${testsTable.status} <> 'SCHEDULED' THEN 'DRAFT'
  WHEN now() < ${testsTable.publishTime} THEN 'SCHEDULED'
  WHEN ${testsTable.closeTime} IS NOT NULL AND now() >= ${testsTable.closeTime} THEN 'COMPLETED'
  ELSE 'PUBLISHED' END`;

// Written with full table names so it works in any select that includes the tests table
export const questionCountSql = sql<number>`(SELECT count(*)::int FROM test_questions q WHERE q.test_id = "tests"."id")`;

export const dbNow = async (executor: Executor = db): Promise<Date> => {
  const result = await executor.execute(sql`SELECT now() AS now`);
  return new Date((result.rows[0] as { now: string | Date }).now);
};

export const loadQuestions = (testId: number, executor: Executor = db) =>
  executor.select().from(testQuestionsTable).where(eq(testQuestionsTable.testId, testId)).orderBy(asc(testQuestionsTable.questionOrder), asc(testQuestionsTable.id));

export type SubmittedAnswer = { question_id: number; my_answer: StudentAnswerValue };

export type ReviewItem = {
  questionId: number;
  questionOrder: number;
  type: string;
  questionText: string;
  passage: string | null;
  options: unknown;
  correctAnswer: string;
  solution: string | null;
  myAnswer: string | null;
  status: AnswerStatus;
  marks: number;
};

// Rejects answers for questions outside this test, duplicates, and answers in the wrong format
export function checkAnswers(questions: TestQuestion[], answers: SubmittedAnswer[]) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const errors: { question_id: number; message: string }[] = [];
  const normalized = new Map<number, string | null>();
  for (const answer of answers) {
    const question = byId.get(answer.question_id);
    if (!question) {
      errors.push({ question_id: answer.question_id, message: "Question does not belong to this test" });
      continue;
    }
    if (normalized.has(answer.question_id)) {
      errors.push({ question_id: answer.question_id, message: "Question answered more than once" });
      continue;
    }
    const result = normalizeStudentAnswer(question as never, answer.my_answer);
    if ("error" in result) errors.push({ question_id: answer.question_id, message: result.error });
    else normalized.set(answer.question_id, result.blank ? null : result.value);
  }
  return { errors, normalized };
}

// Marks the attempt and stores the result. Only succeeds while the attempt is still IN_PROGRESS,
// so double taps, retries and a second device cannot create or change a result.
export async function finalizeAttempt(
  tx: Tx,
  params: {
    attempt: TestSubmission;
    test: Test;
    questions: TestQuestion[];
    rawAnswers: SubmittedAnswer[];
    normalized: Map<number, string | null>;
    reason: SubmissionReason;
    reportedViolationCount?: number;
    submittedAt?: Date;
  },
): Promise<TestSubmission | null> {
  const { attempt, test, questions, normalized } = params;
  const defaults = { marksPositive: test.marksPositive, marksNegative: test.marksNegative };
  let score = 0;
  const counts = { CORRECT: 0, WRONG: 0, SKIPPED: 0 };

  const results: ReviewItem[] = questions.map((question) => {
    const myAnswer = normalized.get(question.id) ?? null;
    const { status, marks } = gradeAnswer(question as never, myAnswer, defaults);
    score += marks;
    counts[status]++;
    return {
      questionId: question.id,
      questionOrder: question.questionOrder,
      type: question.type,
      questionText: question.questionText,
      passage: question.passage,
      options: question.options,
      correctAnswer: question.correctAnswer,
      solution: question.solution,
      myAnswer,
      status,
      marks: roundMarks(marks),
    };
  });

  const [updated] = await tx
    .update(testSubmissionsTable)
    .set({
      status: "SUBMITTED",
      submittedAt: params.submittedAt ?? sql`now()`,
      score: roundMarks(score),
      correctCount: counts.CORRECT,
      wrongCount: counts.WRONG,
      skippedCount: counts.SKIPPED,
      totalQuestions: questions.length,
      answers: params.rawAnswers,
      results,
      submissionReason: params.reason,
      reportedViolationCount: params.reportedViolationCount ?? null,
    })
    .where(and(eq(testSubmissionsTable.id, attempt.id), eq(testSubmissionsTable.status, "IN_PROGRESS")))
    .returning();
  return updated ?? null;
}

// Attempts whose time (plus grace) ran out without a submission are closed as TIME_EXPIRED with every question skipped
export async function closeExpiredAttempts(filter: { testId?: number; userId?: number } = {}) {
  const conditions = [
    eq(testSubmissionsTable.status, "IN_PROGRESS"),
    lt(testSubmissionsTable.endsAt, sql`now() - make_interval(secs => ${SUBMIT_GRACE_MS / 1000}::int)`),
  ];
  if (filter.testId) conditions.push(eq(testSubmissionsTable.testId, filter.testId));
  if (filter.userId) conditions.push(eq(testSubmissionsTable.userId, filter.userId));
  const expired = await db.select().from(testSubmissionsTable).where(and(...conditions));

  for (const attempt of expired) {
    await db.transaction(async (tx) => {
      const [test] = await tx.select().from(testsTable).where(eq(testsTable.id, attempt.testId));
      if (!test) return;
      const questions = await loadQuestions(test.id, tx);
      await finalizeAttempt(tx, {
        attempt,
        test,
        questions,
        rawAnswers: [],
        normalized: new Map(),
        reason: "TIME_EXPIRED",
        submittedAt: attempt.endsAt,
      });
    });
  }
  return expired.length;
}
