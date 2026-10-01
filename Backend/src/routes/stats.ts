import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { count } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/", requireAdmin, async (req, res) => {
  try {
    const userCountResult = await db.select({ count: count() }).from(usersTable);
    const activeStudents = userCountResult[0].count;
    res.json({ success: true, activeStudents });
  } catch (error) {
    console.error("Stats error", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
