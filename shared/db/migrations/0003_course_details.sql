-- Course page details managed from the CMS: mentor (name, one-line experience, photo)
-- and the metrics shown at the top of the course page.
-- Idempotent: safe to run more than once, and safe to run after `pnpm --filter @workspace/db push`.
--
-- Run with:  psql "$DATABASE_URL" -f shared/db/migrations/0003_course_details.sql

ALTER TABLE courses ADD COLUMN IF NOT EXISTS mentor_name text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS mentor_experience text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS mentor_photo text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS students_enrolled integer;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS duration text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS total_lessons integer;