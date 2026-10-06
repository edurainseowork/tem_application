import { Router } from "express";
import { desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminNotificationsTable, pushTokensTable } from "@workspace/db/schema";
import { PushTokenBody } from "@workspace/api-zod";
import { findDbUserId, requireAuth } from "../middlewares/auth.js";

// App side of admin notifications (separate from live class notifications in notifications.ts)
const router = Router();

router.use(requireAuth);

// Notifications sent by the admin, newest first. Every signed-in user sees all of them.
router.get("/", async (_req, res) => {
  const rows = await db.select({
    id: adminNotificationsTable.id,
    title: adminNotificationsTable.title,
    body: adminNotificationsTable.body,
    imageUrl: adminNotificationsTable.imageUrl,
    createdAt: adminNotificationsTable.createdAt,
  })
    .from(adminNotificationsTable)
    .orderBy(desc(adminNotificationsTable.createdAt), desc(adminNotificationsTable.id))
    .limit(50);
  res.json({ success: true, data: rows });
});

// Save this device's Expo push token for the signed-in user.
// A token moves to whoever signed in last on that device.
router.post("/push-token", async (req, res) => {
  const parsed = PushTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid push token" });
    return;
  }

  const userId = await findDbUserId(req.auth!.uid);
  if (userId === null) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { token, platform } = parsed.data;
  await db.insert(pushTokensTable)
    .values({ userId, token, platform: platform ?? null })
    .onConflictDoUpdate({
      target: pushTokensTable.token,
      set: { userId, platform: platform ?? null, updatedAt: new Date() },
    });
  res.json({ success: true });
});

export default router;
