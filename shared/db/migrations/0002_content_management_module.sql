-- Content Management Module migration (PRD v1.2 Sections 6.3, 10, 11)
-- Nested content tree: folders, videos, pdfs, notes, quizzes
-- Idempotent: safe to run more than once.

BEGIN;

-- 1. Create content type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_content_type') THEN
    CREATE TYPE course_content_type AS ENUM ('folder', 'video', 'pdf', 'note', 'quiz');
  END IF;
END $$;

-- 2. Ensure course_content table exists
CREATE TABLE IF NOT EXISTS course_content (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  parent_id text,
  title text NOT NULL,
  type course_content_type NOT NULL,
  media_url text,
  file_size varchar(50),
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- 3. If course_content table already existed with older schema, alter columns
DO $$
DECLARE
  id_type text;
  parent_id_type text;
  type_type text;
BEGIN
  SELECT data_type INTO id_type
  FROM information_schema.columns
  WHERE table_name = 'course_content' AND column_name = 'id';

  -- Convert id from integer to text with gen_random_uuid()::text default if needed
  IF id_type = 'integer' THEN
    ALTER TABLE course_content DROP CONSTRAINT IF EXISTS course_content_parent_id_fk;
    ALTER TABLE course_content ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE course_content ALTER COLUMN id TYPE text USING id::text;
    ALTER TABLE course_content ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
  END IF;

  SELECT data_type INTO parent_id_type
  FROM information_schema.columns
  WHERE table_name = 'course_content' AND column_name = 'parent_id';

  IF parent_id_type = 'integer' THEN
    ALTER TABLE course_content ALTER COLUMN parent_id TYPE text USING parent_id::text;
  END IF;

  -- Add media_url column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_content' AND column_name = 'media_url'
  ) THEN
    ALTER TABLE course_content ADD COLUMN media_url text;
  END IF;

  -- Backfill media_url from url if url column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_content' AND column_name = 'url'
  ) THEN
    UPDATE course_content SET media_url = url WHERE media_url IS NULL AND url IS NOT NULL;
  END IF;

  -- Add file_size column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_content' AND column_name = 'file_size'
  ) THEN
    ALTER TABLE course_content ADD COLUMN file_size varchar(50);
  END IF;

  -- Add order column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_content' AND column_name = 'order'
  ) THEN
    ALTER TABLE course_content ADD COLUMN "order" integer NOT NULL DEFAULT 0;
  END IF;

  -- Add updated_at column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_content' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE course_content ADD COLUMN updated_at timestamp NOT NULL DEFAULT now();
  END IF;

  -- Convert type column to enum if currently text
  SELECT udt_name INTO type_type
  FROM information_schema.columns
  WHERE table_name = 'course_content' AND column_name = 'type';

  IF type_type <> 'course_content_type' THEN
    UPDATE course_content SET type = 'folder' WHERE type NOT IN ('folder', 'video', 'pdf', 'note', 'quiz');
    ALTER TABLE course_content ALTER COLUMN type TYPE course_content_type USING type::course_content_type;
  END IF;
END $$;

-- 4. Foreign key constraint for parent_id -> course_content(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_content_parent_id_fk'
  ) THEN
    ALTER TABLE course_content
      ADD CONSTRAINT course_content_parent_id_fk
      FOREIGN KEY (parent_id) REFERENCES course_content(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS course_content_course_id_idx ON course_content (course_id);
CREATE INDEX IF NOT EXISTS course_content_parent_id_idx ON course_content (parent_id);
CREATE INDEX IF NOT EXISTS course_content_order_idx ON course_content ("order");

COMMIT;
