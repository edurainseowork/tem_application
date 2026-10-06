import { inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { pushTokensTable } from "@workspace/db/schema";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100; // Expo accepts at most 100 messages per request

export type PushMessage = {
  title: string;
  body: string;
  imageUrl?: string | null;
  data?: Record<string, unknown>;
};

type ExpoTicket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };

/**
 * Sends one notification to many devices through the Expo Push Service (which delivers via FCM on
 * Android and APNs on iOS), so it arrives even when the app is in the background or closed.
 * Tokens Expo reports as no longer registered (app uninstalled) are deleted.
 */
export async function sendExpoPush(tokens: string[], message: PushMessage): Promise<{ sent: number; failed: number }> {
  const uniqueTokens = [...new Set(tokens)];
  let sent = 0;
  let failed = 0;
  const staleTokens: string[] = [];

  for (let i = 0; i < uniqueTokens.length; i += BATCH_SIZE) {
    const batch = uniqueTokens.slice(i, i + BATCH_SIZE);
    const payload = batch.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      sound: "default",
      priority: "high",
      channelId: "default",
      data: message.data ?? {},
      ...(message.imageUrl ? { richContent: { image: message.imageUrl } } : {}),
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          // Only needed if "Enhanced push security" is enabled for the Expo project
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[]; errors?: unknown };
      if (!res.ok || !Array.isArray(json.data)) {
        logger.error({ status: res.status, errors: json.errors }, "Expo push request failed");
        failed += batch.length;
        continue;
      }
      json.data.forEach((ticket, index) => {
        if (ticket.status === "ok") {
          sent++;
          return;
        }
        failed++;
        if (ticket.details?.error === "DeviceNotRegistered") staleTokens.push(batch[index]);
        else logger.warn({ error: ticket.details?.error, message: ticket.message }, "Expo push ticket error");
      });
    } catch (err) {
      logger.error({ err }, "Expo push request errored");
      failed += batch.length;
    }
  }

  if (staleTokens.length > 0) {
    await db.delete(pushTokensTable).where(inArray(pushTokensTable.token, staleTokens));
  }
  return { sent, failed };
}
