import { auth } from '../firebaseConfig';
import { API_BASE_URL } from './client';

// Student test APIs. The server keeps the timer, marks the answers and never sends the answer key early.

export type TestStatus = 'SCHEDULED' | 'PUBLISHED' | 'COMPLETED';
export type SubmissionReason = 'MANUAL_SUBMIT' | 'TIME_EXPIRED' | 'CHEATING_APP_MINIMIZED' | 'CHEATING_SCREEN_EXIT';
export type QuestionType = 'multiple_choice' | 'integer' | 'fill_ups' | 'true_false' | 'comprehension' | 'match_the_following';

export interface AttemptSummary {
  id: number;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  started_at: string;
  end_at: string;
  submitted_at: string | null;
  score?: number;
  correct_count?: number;
  wrong_count?: number;
  skipped_count?: number;
  total_questions?: number;
  submission_reason?: string | null;
}

export interface StudentTest {
  id: number;
  courseId: number;
  courseName: string;
  title: string;
  description: string | null;
  targetBatch: string | null;
  status: TestStatus;
  publishTime: string;
  closeTime: string | null;
  durationMinutes: number;
  marksPositive: number;
  marksNegative: number;
  totalQuestions: number;
  myAttempt: AttemptSummary | null;
}

export interface OptionItem { key: string; text: string }
export interface MatchOptions { left: OptionItem[]; right: OptionItem[] }

export interface TestQuestion {
  id: number;
  question_order: number;
  type: QuestionType;
  question_text: string;
  passage: string | null;
  options: OptionItem[] | MatchOptions | null;
  multiple_correct: boolean;
  marks_positive: number;
  marks_negative: number;
}

export interface StartedTest {
  test_id: number;
  course_name: string;
  test_title: string;
  duration_minutes: number;
  total_questions: number;
  started_at: string;
  end_at: string;
  server_time: string;
}

export interface ReviewItem {
  questionId: number;
  questionOrder: number;
  type: QuestionType;
  questionText: string;
  passage: string | null;
  options: OptionItem[] | MatchOptions | null;
  correctAnswer: string;
  solution: string | null;
  myAnswer: string | null;
  status: 'CORRECT' | 'WRONG' | 'SKIPPED';
  marks: number;
}

export interface TestResult extends AttemptSummary {
  test_id: number;
  course_name: string;
  test_title: string;
  answers_available: boolean;
  review: ReviewItem[] | null;
}

export type AnswerValue = string | null;

// Carries the HTTP status so screens can tell "time is over" (409) from other errors
export class TestApiError extends Error {
  constructor(public status: number, message: string, public payload: any) {
    super(message);
  }
}

const authFetch = async (path: string, init: RequestInit = {}) => {
  // After a page reload Firebase restores the saved login asynchronously; wait for it
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new TestApiError(401, 'Not signed in', null);
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data.issues) ? `: ${data.issues.map((i: { message: string }) => i.message).join('; ')}` : '';
    throw new TestApiError(res.status, (data.error || `Request failed (${res.status})`) + details, data);
  }
  return data;
};

export const fetchCourseTests = async (courseId: number | string): Promise<StudentTest[]> =>
  (await authFetch(`/tests?courseId=${encodeURIComponent(String(courseId))}`)).data;

export const fetchTest = async (testId: number | string): Promise<StudentTest> =>
  (await authFetch(`/tests/${testId}`)).data;

export const startTest = async (testId: number | string): Promise<StartedTest> =>
  (await authFetch(`/tests/${testId}/start`, { method: 'POST' })).data;

export const fetchTestQuestions = async (testId: number | string): Promise<{ end_at: string; server_time: string; violation_count: number; questions: TestQuestion[] }> =>
  (await authFetch(`/tests/${testId}/questions`)).data;

export const reportViolation = async (testId: number | string, type: 'APP_MINIMIZED' | 'SCREEN_EXIT'): Promise<number> =>
  (await authFetch(`/tests/${testId}/violations`, { method: 'POST', body: JSON.stringify({ type }) })).data.violation_count;

export const submitTest = async (
  testId: number | string,
  answers: Record<number, AnswerValue>,
  reason: SubmissionReason,
  violationCount: number,
): Promise<{ alreadySubmitted: boolean; data: AttemptSummary }> =>
  authFetch(`/tests/${testId}/submit`, {
    method: 'POST',
    body: JSON.stringify({
      answers: Object.entries(answers).map(([questionId, myAnswer]) => ({ question_id: Number(questionId), my_answer: myAnswer })),
      submission_reason: reason,
      violation_count: violationCount,
    }),
  });

export const fetchTestResult = async (testId: number | string): Promise<TestResult> =>
  (await authFetch(`/tests/${testId}/result`)).data;

// ---- Display helpers ----

export const choiceOptions = (options: TestQuestion['options']): OptionItem[] => (Array.isArray(options) ? options : []);
export const matchOptions = (options: TestQuestion['options']): MatchOptions | null =>
  options && !Array.isArray(options) && 'left' in options ? options : null;

// "Thu, 9 Oct, 7:00 PM"
export const formatTestTime = (value: string) =>
  new Date(value).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// 3725 s → "1:02:05", 125 s → "02:05"
export const formatCountdown = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

export const SUBMISSION_REASON_TEXT: Record<string, string> = {
  MANUAL_SUBMIT: 'Submitted by you',
  TIME_EXPIRED: 'Submitted automatically when time ran out',
  CHEATING_APP_MINIMIZED: 'Submitted automatically: you left the app during the test',
  CHEATING_SCREEN_EXIT: 'Submitted automatically: you left the test screen',
  ADMIN_SUBMISSION: 'Closed by your teacher',
};