-- Student profile: editable details, profile photo and day streak.
-- Idempotent: safe to run more than once, and safe to run after `pnpm --filter @workspace/db push`.
--
-- Run with:  psql "$DATABASE_URL" -f shared/db/migrations/0005_user_profile.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender varchar(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city varchar(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS state varchar(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pincode varchar(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();