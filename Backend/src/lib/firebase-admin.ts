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
  const serviceAccountPath = path.resolve(process.cwd(), "firebase-service-account.json");
  return JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")) as ServiceAccount;
}

if (!getApps().length) {
  initializeApp({ credential: cert(loadServiceAccount()) });
}

export const firebaseAuth = getAuth();
