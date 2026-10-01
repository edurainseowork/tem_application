import { Router } from "express";
import { requireAdmin } from "../../middlewares/auth";
import coursesRouter from "./courses.js";
import categoriesRouter from "./categories.js";

// Everything under /api/admin requires a verified Firebase token with the admin claim.
const router = Router();

router.use(requireAdmin);
router.use("/courses", coursesRouter);
router.use("/categories", categoriesRouter);

export default router;
