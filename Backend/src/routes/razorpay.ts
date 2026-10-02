import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db } from "@workspace/db";
import { userCoursesTable, coursesTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateDiscount, checkCoupon, redeemCoupon } from "./coupons.js";

const router = Router();

// Instantiate Razorpay only if keys are present (for safety)
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET 
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

router.post("/order", async (req, res) => {
  const { courseId, finalPrice, couponCode } = req.body;
  if (!razorpay) return res.status(500).json({ error: "Razorpay not configured" });

  try {
    let amount = finalPrice;
    const notes: Record<string, string> = { courseId: String(courseId) };

    // With a coupon the amount is computed here from the course price, never trusted from the client
    if (couponCode) {
      const [course] = await db.select({ price: coursesTable.price }).from(coursesTable).where(eq(coursesTable.id, Number(courseId)));
      if (!course) return res.status(404).json({ error: "Course not found" });
      const result = await checkCoupon(String(couponCode), Number(courseId));
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      amount = calculateDiscount(course.price, result.coupon.discountPercent).finalPrice;
      notes.couponId = String(result.coupon.id);
    }

    const options = {
      amount, // in paise
      currency: "INR",
      receipt: `receipt_course_${courseId}`,
      notes,
    };
    
    const order = await razorpay.orders.create(options);
    res.json(order);
    return;
  } catch (error) {
    res.status(500).json({ error: "Failed to create Razorpay order" });
    return;
  }
});

router.post("/verify", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId, firebaseUid } = req.body;
  
  if (!process.env.RAZORPAY_KEY_SECRET) return res.status(500).json({ error: "Razorpay not configured" });

  try {
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      // Payment is successful, find user and add course
      const users = await db.select().from(usersTable).where(eq(usersTable.firebaseUid, firebaseUid));
      if (users.length > 0) {
        await db.insert(userCoursesTable).values({
          userId: users[0].id,
          courseId: courseId,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
        });
      }

      // Count the coupon use against the paid order. The limit was checked when the order was created;
      // a payment that completes after another student used the last slot is still honoured.
      const order = await razorpay?.orders.fetch(razorpay_order_id);
      const couponId = Number(order?.notes?.couponId);
      if (couponId) {
        await db.transaction((tx) => redeemCoupon(tx, couponId, { courseId: Number(courseId), firebaseUid, razorpayOrderId: razorpay_order_id }, { enforceLimit: false }));
      }
      res.json({ success: true, message: "Payment verified successfully" });
      return;
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: "Payment verification failed" });
    return;
  }
});

export default router;
