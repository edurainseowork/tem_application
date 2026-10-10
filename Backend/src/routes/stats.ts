import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, categoriesTable, courseContentTable, testsTable, bannersTable, liveClassesTable, couponsTable } from "@workspace/db/schema";
import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/", requireAdmin, async (req, res) => {
  try {
    const userCountResult = await db.select({ count: count() }).from(usersTable);
    const activeStudents = userCountResult[0].count;
    
    // Fetch all users
    const users = await db
      .select()
      .from(usersTable)
      .orderBy(usersTable.createdAt);

    // Platform-wide totals (all admins' uploads), shown on every admin's dashboard.
    const tables: Record<string, PgTable> = { categories: categoriesTable, content: courseContentTable, tests: testsTable, banners: bannersTable, liveClasses: liveClassesTable, coupons: couponsTable };
    const content = Object.fromEntries(await Promise.all(Object.entries(tables).map(async ([k, t]) => [k, (await db.select({ c: count() }).from(t))[0].c])));

    res.json({ success: true, activeStudents, content, users: users.reverse() });
  } catch (error) {
    console.error("Stats error", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
