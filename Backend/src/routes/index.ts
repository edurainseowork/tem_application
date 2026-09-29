import { Router } from "express";
import healthRouter from "./health.js";
import coursesRouter from "./courses.js";
import couponsRouter from "./coupons.js";
import razorpayRouter from "./razorpay.js";
import contentRouter from "./content.js";
import uploadRouter from "./upload.js";
import bannersRouter from "./banners.js";
import { authRouter } from "./auth.js";
import statsRouter from "./stats.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/courses", coursesRouter);
router.use("/coupons", couponsRouter);
router.use("/razorpay", razorpayRouter);
router.use("/content", contentRouter);
router.use("/upload", uploadRouter);
router.use("/banners", bannersRouter);
router.use("/auth", authRouter);
router.use("/stats", statsRouter);

export default router;
