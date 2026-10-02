import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Init Firebase Admin if service account is available
try {
  const serviceAccountPath = path.resolve(__dirname, '../firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) });
    }
  }
} catch (e) {
  console.warn('Firebase init warning:', e.message);
}

async function main() {
  const targetEmail = 'abhinavpvt1906@gmail.com';
  
  // 1. Update user in PostgreSQL
  const dbRes = await pool.query(
    "UPDATE users SET role = 'admin' WHERE email = $1 RETURNING *",
    [targetEmail]
  );
  
  if (dbRes.rows.length === 0) {
    console.error(`User with email ${targetEmail} not found in PostgreSQL!`);
  } else {
    console.log('PostgreSQL user updated successfully:', dbRes.rows[0]);
  }

  // 2. Set Firebase custom claims if available
  const user = dbRes.rows[0];
  if (user && user.firebase_uid && getApps().length > 0) {
    try {
      const auth = getAuth();
      await auth.setCustomUserClaims(user.firebase_uid, {
        role: 'admin',
        admin: true,
      });
      console.log(`Firebase custom claims updated for UID ${user.firebase_uid}: role='admin', admin=true`);
    } catch (firebaseErr) {
      console.warn('Could not set Firebase custom claims:', firebaseErr.message);
    }
  }

  await pool.end();
}

main().catch(console.error);
