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
import categoriesRouter from "./categories.js";
import adminRouter from "./admin/index.js";
import liveClassesRouter from "./liveClasses.js";
import notificationsRouter from "./notifications.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/courses", coursesRouter);
router.use("/categories", categoriesRouter);
router.use("/admin", adminRouter);
router.use("/coupons", couponsRouter);
router.use("/razorpay", razorpayRouter);
router.use("/content", contentRouter);
router.use("/upload", uploadRouter);
router.use("/banners", bannersRouter);
router.use("/auth", authRouter);
router.use("/stats", statsRouter);
// Mounted at the root: serves /courses/:courseId/live-classes and /live-classes/:id
router.use(liveClassesRouter);
router.use("/notifications", notificationsRouter);

export default router;
