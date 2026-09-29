import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { db } from "@workspace/db";
import { userCoursesTable, coursesTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// Instantiate Razorpay only if keys are present (for safety)
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET 
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

router.post("/order", async (req, res) => {
  const { courseId, finalPrice } = req.body;
  if (!razorpay) return res.status(500).json({ error: "Razorpay not configured" });

  try {
    const options = {
      amount: finalPrice, // in paise
      currency: "INR",
      receipt: `receipt_course_${courseId}`,
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
