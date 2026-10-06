-- Multiple mentors per course: replaces mentor_name / mentor_experience / mentor_photo
-- with a "mentors" JSON list. Existing single-mentor data is copied over first.
-- Idempotent: safe to run more than once, and whether or not 0003 was run before.
--
-- Run with:  psql "$DATABASE_URL" -f shared/db/migrations/0004_course_mentors.sql

BEGIN;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS mentors jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'mentor_name'
  ) THEN
    UPDATE courses
    SET mentors = jsonb_build_array(jsonb_build_object(
      'name', mentor_name,
      'experience', mentor_experience,
      'photo', mentor_photo
    ))
    WHERE mentor_name IS NOT NULL AND btrim(mentor_name) <> '' AND mentors = '[]'::jsonb;

    ALTER TABLE courses DROP COLUMN IF EXISTS mentor_name;
    ALTER TABLE courses DROP COLUMN IF EXISTS mentor_experience;
    ALTER TABLE courses DROP COLUMN IF EXISTS mentor_photo;
  END IF;
END $$;

COMMIT;