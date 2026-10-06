import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db } from "@workspace/db";
import { userCoursesTable, coursesTable, paymentsTable, usersTable } from "@workspace/db/schema";
import { CreatePaymentOrderBody, PaymentFailedBody, VerifyPaymentBody } from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";
import { calculateDiscount, checkCoupon, redeemCoupon } from "./coupons.js";
import { requireAuth } from "../middlewares/auth.js";
import { logger } from "../lib/logger";

// Razorpay checkout (test mode with rzp_test_ keys). RAZORPAY_SECRET stays on the server;
// the app only ever receives the public key id (RAZORPAY_KEY) and the order id.
const router = Router();

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_SECRET;
const razorpay = keyId && keySecret ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null;

// Razorpay does not accept orders below ₹1
const MIN_AMOUNT_PAISE = 100;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const findUser = async (firebaseUid: string) => {
  const [user] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.firebaseUid, firebaseUid));
  return user ?? null;
};

const isEnrolled = async (userId: number, courseId: number) => {
  const [row] = await db.select({ id: userCoursesTable.id }).from(userCoursesTable)
    .where(and(eq(userCoursesTable.userId, userId), eq(userCoursesTable.courseId, courseId)))
    .limit(1);
  return !!row;
};

// Adds the course to the student's purchases unless it is already there
const enroll = async (tx: Tx, userId: number, courseId: number, payment?: { orderId: string; paymentId: string }) => {
  const [existing] = await tx.select({ id: userCoursesTable.id }).from(userCoursesTable)
    .where(and(eq(userCoursesTable.userId, userId), eq(userCoursesTable.courseId, courseId)))
    .limit(1);
  if (existing) return;
  await tx.insert(userCoursesTable).values({
    userId,
    courseId,
    razorpayOrderId: payment?.orderId ?? null,
    razorpayPaymentId: payment?.paymentId ?? null,
  });
};

const signatureIsValid = (orderId: string, paymentId: string, signature: string, secret: string) => {
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

// Step 1: create a Razorpay order for a course. The amount comes from the database (and coupon), never the app.
router.post("/order", requireAuth, async (req, res) => {
  const parsed = CreatePaymentOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
    return;
  }
  const { courseId, couponCode } = parsed.data;

  try {
    const user = await findUser(req.auth!.uid);
    if (!user) {
      res.status(404).json({ error: "User not found. Please log in again." });
      return;
    }
    const [course] = await db.select({ id: coursesTable.id, title: coursesTable.title, price: coursesTable.price, isPublished: coursesTable.isPublished })
      .from(coursesTable)
      .where(eq(coursesTable.id, courseId));
    if (!course || !course.isPublished) {
      res.status(404).json({ error: "Course not found" });
      return;
    }
    if (await isEnrolled(user.id, courseId)) {
      res.status(409).json({ error: "You already own this course" });
      return;
    }

    let amount = course.price;
    let couponId: number | null = null;
    if (couponCode) {
      const result = await checkCoupon(couponCode, courseId);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      amount = calculateDiscount(course.price, result.coupon.discountPercent).finalPrice;
      couponId = result.coupon.id;
    }

    // Free after coupon (e.g. 100% off): no payment needed
    if (amount <= 0) {
      await db.transaction(async (tx) => {
        await enroll(tx, user.id, courseId);
        if (couponId) await redeemCoupon(tx, couponId, { courseId, firebaseUid: req.auth!.uid });
      });
      res.json({ success: true, free: true, courseId });
      return;
    }
    if (amount < MIN_AMOUNT_PAISE) {
      res.status(400).json({ error: "The amount after discount is below ₹1, which cannot be paid online" });
      return;
    }

    if (!razorpay) {
      res.status(500).json({ error: "Payments are not configured. Set RAZORPAY_KEY and RAZORPAY_SECRET in .env." });
      return;
    }

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `c${courseId}_u${user.id}_${Date.now()}`.slice(0, 40),
      notes: { courseId: String(courseId), userId: String(user.id), ...(couponId ? { couponId: String(couponId) } : {}) },
    });

    await db.insert(paymentsTable).values({
      userId: user.id,
      courseId,
      razorpayOrderId: order.id,
      amount,
      currency: "INR",
      couponId,
    });

    res.json({
      success: true,
      free: false,
      orderId: order.id,
      amount,
      currency: "INR",
      keyId, // public key id only, safe for the app
      courseTitle: course.title,
      prefill: { name: user.name ?? "", email: user.email },
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to create Razorpay order");
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

// Step 2: after checkout succeeds, verify Razorpay's signature and unlock the course.
// Safe to call more than once for the same order.
router.post("/verify", requireAuth, async (req, res) => {
  const parsed = VerifyPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payment details" });
    return;
  }
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;
  if (!keySecret) {
    res.status(500).json({ error: "Payments are not configured. Set RAZORPAY_KEY and RAZORPAY_SECRET in .env." });
    return;
  }

  try {
    const user = await findUser(req.auth!.uid);
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.razorpayOrderId, orderId));
    // Same response for unknown orders and other users' orders
    if (!user || !payment || payment.userId !== user.id) {
      res.status(404).json({ error: "Payment order not found" });
      return;
    }
    if (!signatureIsValid(orderId, paymentId, signature, keySecret)) {
      logger.warn({ orderId, userId: user.id }, "Razorpay signature mismatch");
      res.status(400).json({ success: false, error: "Payment could not be verified" });
      return;
    }

    if (payment.status !== "paid") {
      await db.transaction(async (tx) => {
        await tx.update(paymentsTable)
          .set({ status: "paid", razorpayPaymentId: paymentId, failureReason: null, updatedAt: new Date() })
          .where(eq(paymentsTable.id, payment.id));
        await enroll(tx, payment.userId, payment.courseId, { orderId, paymentId });
        // Count the coupon use once per order. The limit was checked when the order was created,
        // so a payment that completes after the last slot was taken is still honoured.
        if (payment.couponId) {
          await redeemCoupon(tx, payment.couponId, { courseId: payment.courseId, firebaseUid: req.auth!.uid, razorpayOrderId: orderId }, { enforceLimit: false });
        }
      });
      logger.info({ orderId, paymentId, userId: payment.userId, courseId: payment.courseId }, "Razorpay payment verified");
    }

    res.json({ success: true, message: "Payment verified successfully", courseId: payment.courseId });
  } catch (error) {
    logger.error({ err: error, orderId }, "Payment verification failed");
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// Optional: the app reports a failed or cancelled checkout so the order shows as failed
router.post("/failed", requireAuth, async (req, res) => {
  const parsed = PaymentFailedBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
    return;
  }
  try {
    const user = await findUser(req.auth!.uid);
    if (user) {
      await db.update(paymentsTable)
        .set({ status: "failed", failureReason: parsed.data.reason ?? null, updatedAt: new Date() })
        .where(and(
          eq(paymentsTable.razorpayOrderId, parsed.data.razorpay_order_id),
          eq(paymentsTable.userId, user.id),
          eq(paymentsTable.status, "created"),
        ));
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Failed to record payment failure");
    res.status(500).json({ error: "Failed to update payment" });
  }
});

// Course ids the signed-in student has bought, so the app can unlock them on any device
router.get("/my-courses", requireAuth, async (req, res) => {
  try {
    const user = await findUser(req.auth!.uid);
    if (!user) {
      res.json({ success: true, data: [] });
      return;
    }
    const rows = await db.selectDistinct({ courseId: userCoursesTable.courseId })
      .from(userCoursesTable)
      .where(eq(userCoursesTable.userId, user.id));
    res.json({ success: true, data: rows.map((row) => row.courseId) });
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch purchased courses");
    res.status(500).json({ error: "Failed to fetch purchased courses" });
  }
});

export default router;
