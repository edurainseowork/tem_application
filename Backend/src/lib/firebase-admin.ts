import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";

// Credentials come from FIREBASE_SERVICE_ACCOUNT (the JSON as a string, for Lambda / CI)
// or from firebase-service-account.json next to the process (local dev). Never commit either.
function loadServiceAccount(): ServiceAccount {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) {
    return JSON.parse(fromEnv) as ServiceAccount;
  }
  const possiblePaths = [
    path.resolve(process.cwd(), "firebase-service-account.json"),
    path.resolve(process.cwd(), "Backend", "firebase-service-account.json"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) as ServiceAccount;
    }
  }
  const serviceAccountPath = possiblePaths[0];
  return JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")) as ServiceAccount;
}

if (!getApps().length) {
  initializeApp({ credential: cert(loadServiceAccount()) });
}

export const firebaseAuth = getAuth();
