// Grant or revoke CMS admin rights for a Firebase user.
//
//   node tools/set-admin.mjs grant  someone@edurain.in
//   node tools/set-admin.mjs revoke someone@edurain.in
//   node tools/set-admin.mjs list
//
// Uses firebase-service-account.json in Backend/ (or FIREBASE_SERVICE_ACCOUNT env JSON).
// The admin must sign out and back in to the CMS after a change (tokens carry the claim).
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "node:fs";
import path from "node:path";

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "firebase-service-account.json"), "utf8"));

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();

const [command, email] = process.argv.slice(2);

async function main() {
  if (command === "list") {
    let pageToken;
    do {
      const page = await auth.listUsers(1000, pageToken);
      for (const u of page.users) if (u.customClaims?.admin === true) console.log(u.email ?? u.uid);
      pageToken = page.pageToken;
    } while (pageToken);
    return;
  }

  if ((command !== "grant" && command !== "revoke") || !email) {
    console.error("Usage: node tools/set-admin.mjs <grant|revoke> <email> | list");
    process.exit(1);
  }

  let user;
  try {
    user = await auth.getUserByEmail(email.trim());
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      console.error(
        `No Firebase account exists for ${email}.\n` +
          "Create it first: Firebase Console → Authentication → Users → Add user (email + password),\n" +
          "then run this command again.",
      );
      process.exit(1);
    }
    throw err;
  }
  const claims = { ...(user.customClaims ?? {}) };
  if (command === "grant") claims.admin = true;
  else delete claims.admin;

  await auth.setCustomUserClaims(user.uid, claims);
  // Kill existing sessions so a revoke takes effect immediately (admin routes check revocation).
  await auth.revokeRefreshTokens(user.uid);
  console.log(`${command === "grant" ? "Granted" : "Revoked"} admin for ${user.email} (${user.uid})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});