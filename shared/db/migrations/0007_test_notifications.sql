-- Test notifications: links a student's in-app notification to the test it announces.
-- Idempotent: safe to run more than once, and safe to run after `pnpm --filter @workspace/db push`.
-- Run AFTER 0006_tests.sql. Only adds one nullable column and an index to notifications.
--
-- Run with:  psql "$DATABASE_URL" -f shared/db/migrations/0007_test_notifications.sql
-- (or paste it into your database's SQL editor)

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS test_id integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_test_id_tests_id_fk') THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_id_test_id_idx ON notifications (user_id, test_id);
