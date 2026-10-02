import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  console.log('--- Verifying abhinav role in Postgres ---');
  const res = await pool.query("SELECT id, firebase_uid, email, role FROM users WHERE email = 'abhinavpvt1906@gmail.com'");
  console.log('User in DB:', res.rows[0]);

  if (res.rows[0]?.role !== 'admin') {
    throw new Error('User role is not admin in database!');
  }

  console.log('--- Testing reorder with mock admin token ---');
  const apiRes = await fetch('http://localhost:5000/api/content/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-admin'
    },
    body: JSON.stringify([])
  });
  const data = await apiRes.json();
  console.log('Reorder response status:', apiRes.status, data);

  await pool.end();
}

test().catch(console.error);
