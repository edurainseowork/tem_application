import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { userCoursesTable, coursesTable, usersTable, paymentsTable } from "@workspace/db/schema";
import { VerifyGooglePlayPaymentBody } from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { logger } from "../lib/logger";

const router = Router();

const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.edurainindia.app";

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

// Cached Google OAuth Access Token
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

const getServiceAccount = (): GoogleServiceAccount | null => {
  const envVal = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  if (!envVal) return null;
  try {
    const parsed = typeof envVal === "string" ? JSON.parse(envVal) : envVal;
    if (parsed.client_email && parsed.private_key) {
      return parsed;
    }
  } catch (e) {
    logger.error({ err: e }, "Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT json");
  }
  return null;
};

// Generates Google OAuth2 Access Token using Service Account JWT (Zero extra dependencies)
async function getGoogleAccessToken(sa: GoogleServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const b64Url = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsignedToken = `${b64Url(header)}.${b64Url(claim)}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsignedToken);
  const signature = sign
    .sign(sa.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth token failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };

  return data.access_token;
}

/**
 * Report Alternative Billing (Razorpay) transaction to Google Play within 24 hours
 * as required by Google Play User Choice Billing Policy (India).
 */
export async function reportAlternativeBillingToGoogle(params: {
  externalTransactionId: string;
  originalAlternativeBillingToken: string;
  amountInPaise: number;
  currency?: string;
}) {
  const sa = getServiceAccount();
  if (!sa) {
    logger.warn("Skipping Google alternative billing reporting: GOOGLE_PLAY_SERVICE_ACCOUNT not configured");
    return;
  }

  try {
    const accessToken = await getGoogleAccessToken(sa);
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/externalTransactions?externalTransactionId=${encodeURIComponent(params.externalTransactionId)}`;

    const units = Math.floor(params.amountInPaise / 100);
    const nanos = (params.amountInPaise % 100) * 10_000_000;

    const body = {
      originalExternalTransactionId: params.originalAlternativeBillingToken,
      transactionState: "TRANSACTION_STATE_REPORTED",
      transactionTime: new Date().toISOString(),
      transactionProgram: "EXTERNAL_TRANSACTION_PROGRAM_USER_CHOICE_BILLING",
      preTaxAmount: {
        currency: params.currency || "INR",
        units: String(units),
        nanos,
      },
      taxAmount: {
        currency: params.currency || "INR",
        units: "0",
        nanos: 0,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`Google Alternative Billing reporting error (${res.status}): ${errText}`);
    } else {
      logger.info(`Successfully reported alternative transaction ${params.externalTransactionId} to Google Play`);
    }
  } catch (err: any) {
    logger.error({ err }, "Exception reporting alternative transaction to Google Play");
  }
}

// Enrolls user and links purchase
const enrollGooglePlay = async (
  userId: number,
  courseId: number,
  productId: string,
  purchaseToken: string,
  amount: number
) => {
  const [existing] = await db
    .select({ id: userCoursesTable.id })
    .from(userCoursesTable)
    .where(and(eq(userCoursesTable.userId, userId), eq(userCoursesTable.courseId, courseId)))
    .limit(1);

  if (existing) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(userCoursesTable).values({
      userId,
      courseId,
      paymentMethod: "google_play",
      playPurchaseToken: purchaseToken,
      playOrderId: `gplay_${productId}_${Date.now()}`,
    });

    await tx.insert(paymentsTable).values({
      userId,
      courseId,
      razorpayOrderId: `gplay_${purchaseToken.slice(0, 30)}_${Date.now()}`.slice(0, 40),
      razorpayPaymentId: `gpay_${productId}`,
      amount,
      currency: "INR",
      paymentProvider: "google_play",
      status: "paid",
    });
  });
};

/**
 * POST /api/google-play/verify
 * Verifies in-app purchase token with Google Play Developer API and unlocks course
 */
router.post("/verify", requireAuth, async (req, res) => {
  const parse = VerifyGooglePlayPaymentBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message || "Invalid Google Play purchase data" });
    return;
  }

  const { courseId, productId, purchaseToken } = parse.data;

  try {
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.firebaseUid, req.auth!.uid))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User account not found" });
      return;
    }

    const [course] = await db
      .select({ id: coursesTable.id, title: coursesTable.title, price: coursesTable.price, playProductId: coursesTable.playProductId })
      .from(coursesTable)
      .where(eq(coursesTable.id, courseId))
      .limit(1);

    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    // Check if already enrolled
    const [alreadyEnrolled] = await db
      .select({ id: userCoursesTable.id })
      .from(userCoursesTable)
      .where(and(eq(userCoursesTable.userId, user.id), eq(userCoursesTable.courseId, courseId)))
      .limit(1);

    if (alreadyEnrolled) {
      res.json({ success: true, message: "Course already purchased", courseId });
      return;
    }

    const sa = getServiceAccount();

    if (sa) {
      // 1. Verify with Google Play Android Publisher API
      const accessToken = await getGoogleAccessToken(sa);
      const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

      const verifyRes = await fetch(verifyUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!verifyRes.ok) {
        const errText = await verifyRes.text();
        logger.error(`Google Play verify API failed (${verifyRes.status}): ${errText}`);
        res.status(400).json({ error: "Google Play purchase verification failed. Token invalid." });
        return;
      }

      const purchaseData = (await verifyRes.json()) as {
        purchaseState?: number;
        acknowledgementState?: number;
      };

      // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
      if (purchaseData.purchaseState !== 0) {
        res.status(400).json({ error: "Google Play purchase is not completed or is canceled" });
        return;
      }

      // 2. Acknowledge the purchase if not yet acknowledged (Must be acknowledged within 3 days)
      if (purchaseData.acknowledgementState === 0) {
        const ackUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
        await fetch(ackUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ developerPayload: `user_${user.id}_course_${courseId}` }),
        });
      }
    } else {
      // Development fallback if service account JSON not configured yet in local/testing
      logger.warn(
        `GOOGLE_PLAY_SERVICE_ACCOUNT not configured. Accepting token for development/sandbox testing: ${purchaseToken.slice(0, 10)}...`
      );
    }

    // 3. Unlock and enroll course for student
    await enrollGooglePlay(user.id, courseId, productId, purchaseToken, course.price);

    logger.info({ userId: user.id, courseId, productId }, "User enrolled via Google Play in-app billing");

    res.json({
      success: true,
      message: "Course unlocked successfully via Google Play Billing",
      courseId,
    });
  } catch (error: any) {
    logger.error({ err: error }, "Exception during Google Play purchase verification");
    res.status(500).json({ error: error?.message || "Failed to verify Google Play purchase" });
  }
});

export default router;
