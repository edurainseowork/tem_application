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
import enrollmentsRouter from "./enrollments.js";
import adminNotificationsRouter from "./adminNotifications.js";
import profileRouter from "./profile.js"
import bunnyRouter from "./bunny.routes.js";
import cmsTestsRouter from "./cmsTests.js";
import testsRouter from "./tests.js";
import cmsAdminsRouter from "./cmsAdmins.js";
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
// The signed-in student's own profile, photo and day streak
router.use("/profile", profileRouter);
router.use("/stats", statsRouter);
router.use("/enrollments", enrollmentsRouter);
router.use("/cms/tests", cmsTestsRouter);
router.use("/tests", testsRouter);
// Super Admin only: create and remove CMS admins
router.use("/cms/admins", cmsAdminsRouter);
// Mounted at the root: serves /courses/:courseId/live-classes and /live-classes/:id
router.use(liveClassesRouter);
router.use("/notifications", notificationsRouter);
// Admin notifications for the app (separate from the live class notifications above)
router.use("/admin-notifications", adminNotificationsRouter);
router.use(bunnyRouter);

export default router;
