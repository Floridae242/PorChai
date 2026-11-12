import { reminderCard } from "@/lib/chat/cards";
import { dueReminders, forgetReminder } from "@/lib/db/reminders";
import { push } from "@/lib/line/push";
import { withAppButton } from "@/lib/line/reply";
import { refuseWithoutSecret } from "@/lib/ops-secret";

// Card 58: Supabase Cron calls this every 15 minutes (migration 20261113100000_reminders) with
// "Authorization: Bearer <CRON_SECRET>". Each due habit is pushed once; a failed push frees its row
// so the next run tries again.
export async function POST(request: Request): Promise<Response> {
  const refused = refuseWithoutSecret(request);
  if (refused) return refused;

  let sent = 0;
  for (const { lineUserId, log, time } of await dueReminders()) {
    try {
      await push(lineUserId, [withAppButton(reminderCard(log, time))], log.id);
      sent++;
    } catch (err) {
      console.error("reminder push failed", err instanceof Error ? err.message.slice(0, 200) : "");
      await forgetReminder(log.id);
    }
  }
  return Response.json({ sent });
}
