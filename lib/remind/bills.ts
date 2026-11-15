import { getDb } from "@/lib/db/client";
import { thaiDate, addDays } from "@/lib/calc/time";
import { thaiTime } from "@/lib/db/reminders";
import { push } from "@/lib/line/push";
import { billNotification } from "@/lib/line/bill-notification";

// Scheduler must follow the cursor. Two account workers, <=50 enabled schedules per account.
export async function deliverBillBatch(after?: string, now = new Date()) {
  const deadline = Date.now() + 110_000;
  const enabled = process.env.LINE_BILL_REMINDERS_ENABLED === "1";
  const db = getDb(),
    today = thaiDate(now),
    time = thaiTime(now);
  const { data: accounts, error } = await db.rpc("bill_notification_accounts", {
    p_after: after ?? null,
  });
  if (error) throw error;
  const users = accounts as { user_id: string }[];
  let sent = 0,
    failed = 0,
    next = 0,
    attempts = 0,
    repeatPage = false;
  await Promise.all(
    Array.from({ length: Math.min(2, users.length) }, async () => {
      for (;;) {
        const account = users[next++];
        if (!account) return;
        if (Date.now() >= deadline || attempts >= 20) {
          repeatPage = true;
          return;
        }
        try {
          const sync = await db.rpc("sync_bill_schedules", {
            p_user: account.user_id,
            p_today: today,
          });
          if (sync.error) throw sync.error;
          if (!enabled || !sync.data || time < "09:00" || time >= "22:00")
            continue;
          const due = await db.rpc("due_bill_notifications", {
            p_user: account.user_id,
            p_today: today,
          });
          if (due.error) throw due.error;
          for (const bill of due.data) {
            if (Date.now() >= deadline || attempts >= 20) {
              repeatPage = true;
              break;
            }
            attempts++;
            const owner = crypto.randomUUID(),
              lead = bill.due_on === today ? 0 : 3;
            try {
              const claim = await db.rpc("claim_bill_notification", {
                p_user: account.user_id,
                p_plan: bill.id,
                p_lead: lead,
                p_today: today,
                p_owner: owner,
              });
              if (claim.error) throw claim.error;
              if (!claim.data) {
                attempts--;
                continue;
              }
              // Re-read opt-in and paid/cancelled state after claiming. Keep the retry ID on every failure.
              const [plan, schedule, user] = await Promise.all([
                db
                  .from("plans")
                  .select("status,due_on,cycle_id")
                  .eq("id", bill.id)
                  .eq("user_id", account.user_id)
                  .single(),
                db
                  .from("bill_schedules")
                  .select("notify,enabled,repeat")
                  .eq("id", bill.bill_schedule_id)
                  .eq("user_id", account.user_id)
                  .single(),
                db
                  .from("users")
                  .select("line_user_id")
                  .eq("id", account.user_id)
                  .single(),
              ]);
              if (plan.error || schedule.error || user.error)
                throw new Error("Bill recheck failed");
              if (
                plan.data.status !== "reserved" ||
                plan.data.due_on !== addDays(today, lead) ||
                !schedule.data.notify ||
                !schedule.data.enabled
              )
                continue;
              await push(
                user.data.line_user_id,
                [
                  billNotification(
                    {
                      title: bill.title,
                      amount: bill.amount,
                      dueOn: bill.due_on,
                      repeat: schedule.data.repeat,
                    },
                    lead,
                  ),
                ],
                claim.data,
              );
              const ack = await db
                .from("bill_deliveries")
                .update({ state: "sent" })
                .eq("id", claim.data)
                .eq("owner", owner)
                .eq("state", "processing")
                .select("id");
              if (ack.error || !ack.data?.length)
                throw new Error("Bill delivery owner changed");
              sent++;
            } catch {
              failed++;
              console.error("Bill notification delivery failed");
            }
          }
        } catch {
          failed++;
          console.error("Bill account processing failed");
        }
      }
    }),
  );
  return {
    enabled,
    repeatPage,
    sent,
    failed,
    processed: users.length,
    nextCursor: repeatPage
      ? (after ?? null)
      : users.length === 10
        ? users[users.length - 1].user_id
        : null,
  };
}
