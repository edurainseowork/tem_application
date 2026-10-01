-- Course Management Module migration.
-- Idempotent: safe to run more than once, and safe to run after `pnpm --filter @workspace/db push`.
--
-- Run with:  psql "$DATABASE_URL" -f shared/db/migrations/0001_course_module.sql

BEGIN;

CREATE TABLE IF NOT EXISTS categories (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_unique UNIQUE (name),
  CONSTRAINT categories_slug_unique UNIQUE (slug)
);

-- Track whether the columns already existed so existing courses are only
-- auto-published the first time this migration runs.
DO $$
DECLARE
  had_is_published boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'is_published'
  ) INTO had_is_published;

  ALTER TABLE courses ADD COLUMN IF NOT EXISTS original_price integer;
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS category_id integer;
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS published_at timestamp;
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
  ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

  -- Courses that were live before this module existed stay visible in the app.
  IF NOT had_is_published THEN
    UPDATE courses SET is_published = true, published_at = now();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_category_id_categories_id_fk'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_category_id_categories_id_fk
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS courses_category_id_idx ON courses (category_id);
CREATE INDEX IF NOT EXISTS courses_is_published_idx ON courses (is_published);

-- Seed categories from the free-text category values already on courses,
-- then link every course to its category row.
INSERT INTO categories (name, slug)
SELECT DISTINCT trim(category),
       trim(both '-' from regexp_replace(lower(trim(category)), '[^a-z0-9]+', '-', 'g'))
FROM courses
WHERE trim(category) <> ''
ON CONFLICT DO NOTHING;

UPDATE courses c
SET category_id = cat.id, category = cat.name
FROM categories cat
WHERE c.category_id IS NULL AND lower(trim(c.category)) = lower(cat.name);

-- Thumbnails used to be stored as absolute dev URLs (http://localhost:5000/uploads/...),
-- which break on phones and in production. Store them as server-relative paths;
-- the API turns them back into absolute URLs per request.
UPDATE courses
SET thumbnail = regexp_replace(thumbnail, '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/uploads/)', '\3')
WHERE thumbnail ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/uploads/';

COMMIT;
