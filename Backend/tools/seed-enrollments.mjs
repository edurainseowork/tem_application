import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const users = await pool.query('SELECT id, firebase_uid, email FROM users');
  const courses = await pool.query('SELECT id FROM courses');
  for (const u of users.rows) {
    if (u.firebase_uid !== 'test-student-uid-unenrolled') {
      for (const c of courses.rows) {
        const existing = await pool.query('SELECT id FROM user_courses WHERE user_id = $1 AND course_id = $2', [u.id, c.id]);
        if (existing.rows.length === 0) {
          await pool.query('INSERT INTO user_courses (user_id, course_id) VALUES ($1, $2)', [u.id, c.id]);
        }
      }
    }
  }
  const enrollments = await pool.query('SELECT * FROM user_courses');
  console.log('Total enrollments now:', enrollments.rows.length);
  await pool.end();
}

main().catch(console.error);
