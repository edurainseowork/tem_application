import { initializeApp, getApps, cert } from 'firebase-admin/app';
import fs from 'fs';
import path from 'path';

// Initialize Firebase Admin (Only once)
if (!getApps().length) {
  const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account.json');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export { getAuth } from 'firebase-admin/auth';