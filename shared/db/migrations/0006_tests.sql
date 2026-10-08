-- Tests / examinations: tests, their questions, and student attempts (CMS sidebar → Tests).
-- Idempotent: safe to run more than once, and safe to run after `pnpm --filter @workspace/db push`.
-- Only creates new tables; existing tables are not changed.
--
-- Run with:  psql "$DATABASE_URL" -f shared/db/migrations/0006_tests.sql
-- (or paste it into your database's SQL editor)

CREATE TABLE IF NOT EXISTS tests (
  id serial PRIMARY KEY,
  course_id integer NOT NULL,
  title text NOT NULL,
  description text,
  target_batch text,
  status text DEFAULT 'DRAFT' NOT NULL,
  publish_time timestamp with time zone NOT NULL,
  close_time timestamp with time zone,
  duration_minutes integer NOT NULL,
  marks_positive double precision DEFAULT 4 NOT NULL,
  marks_negative double precision DEFAULT 1 NOT NULL,
  created_by text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT tests_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tests_course_id_idx ON tests (course_id);

CREATE TABLE IF NOT EXISTS test_questions (
  id serial PRIMARY KEY,
  test_id integer NOT NULL,
  type text NOT NULL,
  question_text text NOT NULL,
  passage text,
  options jsonb,
  correct_answer text NOT NULL,
  solution text,
  marks_positive double precision,
  marks_negative double precision,
  question_order integer NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT test_questions_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS test_questions_test_id_idx ON test_questions (test_id);

CREATE TABLE IF NOT EXISTS test_submissions (
  id serial PRIMARY KEY,
  test_id integer NOT NULL,
  user_id integer NOT NULL,
  attempt_number integer DEFAULT 1 NOT NULL,
  status text DEFAULT 'IN_PROGRESS' NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  submitted_at timestamp with time zone,
  score double precision DEFAULT 0 NOT NULL,
  correct_count integer DEFAULT 0 NOT NULL,
  wrong_count integer DEFAULT 0 NOT NULL,
  skipped_count integer DEFAULT 0 NOT NULL,
  total_questions integer DEFAULT 0 NOT NULL,
  answers jsonb,
  results jsonb,
  submission_reason text,
  violation_count integer DEFAULT 0 NOT NULL,
  reported_violation_count integer,
  violations jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT test_submissions_attempt_unique UNIQUE (test_id, user_id, attempt_number),
  CONSTRAINT test_submissions_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT test_submissions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS test_submissions_test_id_idx ON test_submissions (test_id);
