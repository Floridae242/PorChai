import { timingSafeEqual } from "node:crypto";
import { reminderCard } from "@/lib/chat/cards";
import { dueReminders, forgetReminder } from "@/lib/db/reminders";
import { push } from "@/lib/line/push";

// Card 58: Supabase Cron calls this every 15 minutes (migration 20261113100000_reminders) with
// "Authorization: Bearer <CRON_SECRET>". Each due habit is pushed once; a failed push frees its row
// so the next run tries again.
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Reminders are not configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sent = 0;
  for (const { lineUserId, log, time } of await dueReminders()) {
    try {
      await push(lineUserId, [reminderCard(log, time)], log.id);
      sent++;
    } catch (err) {
      console.error("reminder push failed", err instanceof Error ? err.message.slice(0, 200) : "");
      await forgetReminder(log.id);
    }
  }
  return Response.json({ sent });
}
