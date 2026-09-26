import { Router } from "express";
import healthRouter from "./health.js";
import coursesRouter from "./courses.js";
import couponsRouter from "./coupons.js";
import razorpayRouter from "./razorpay.js";
import contentRouter from "./content.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/courses", coursesRouter);
router.use("/coupons", couponsRouter);
router.use("/razorpay", razorpayRouter);
router.use("/content", contentRouter);

export default router;
