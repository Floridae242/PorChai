import { thaiDate, addDays } from "@/lib/calc/time";
import { thaiTime } from "@/lib/db/reminders";
import { getDb } from "@/lib/db/client";
import { loadReport } from "@/lib/db/reports";
import { loadSummary } from "@/lib/db/budget";
import { push } from "@/lib/line/push";
import { text } from "@/lib/line/reply";
import { appUrl } from "@/lib/liff/config";
import { formatBaht } from "@/lib/format/money";
import { HttpError } from "@/lib/http";

// Bounded page; scheduler follows nextCursor until null. No production scheduler is enabled here.
export async function deliverDigestBatch(after?: string, now = new Date()) {
  const db = getDb();
  let query = db
    .from("notification_preferences")
    .select("user_id,daily,monthly,budget,send_at")
    .or("daily.eq.true,monthly.eq.true,budget.eq.true")
    .order("user_id")
    .limit(10);
  if (after) query = query.gt("user_id", after);
  const { data: accounts, error } = await query;
  if (error) throw error;
  const today = thaiDate(now),
    time = thaiTime(now);
  let sent = 0,
    failed = 0;
  // Two account workers keep the three possible per-account deliveries well within the route budget.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, accounts.length) }, async () => {
      for (;;) {
        const account = accounts[next++];
        if (!account) return;
        for (const kind of ["daily", "monthly", "budget"] as const) {
          if (!account[kind]) continue;
          if (kind !== "budget" && time < account.send_at.slice(0, 5)) continue;
          if (kind === "monthly" && today.slice(-2) !== "01") continue;
          if (kind === "budget" && (time < "08:00" || time >= "22:00"))
            continue;
          try {
            let body: string;
            const previousMonth = addDays(`${today.slice(0, 7)}-01`, -1);
            const period =
              kind === "monthly" ? previousMonth.slice(0, 7) : today;
            if (kind === "budget") {
              let summary;
              try {
                summary = await loadSummary(account.user_id, now);
              } catch (e) {
                if (e instanceof HttpError && e.code === "no_cycle") continue;
                throw e;
              }
              if (
                summary.budget.kind !== "ok" ||
                summary.spentToday <= summary.budget.dailyBudget
              )
                continue;
              body = `เตือนงบวันนี้ · ${today}\nใช้ไปแล้ว ${formatBaht(summary.spentToday)} บาท จากงบ ${formatBaht(summary.budget.dailyBudget)} บาท\nเปิดแอปดูแผนก่อนตัดสินใจจ่ายเพิ่มได้ครับ`;
            } else {
              const report = await loadReport(
                account.user_id,
                kind === "daily" ? "day" : "month",
                kind === "daily" ? today : `${previousMonth.slice(0, 7)}-01`,
                now,
              );
              body = `สรุป${kind === "daily" ? "รายวัน" : "รายเดือน"} · ${period}\nรายจ่ายที่จด ${formatBaht(report.spending)} บาท · ${report.entriesCount} รายการ\nรายรับที่จด ${formatBaht(report.income)} บาท\nรายรับ − รายจ่าย ${formatBaht(report.net)} บาท\nรวมบิลที่จ่ายแล้ว ตัวเลขนี้ไม่ใช่เงินคงเหลือครับ`;
            }
            const owner = crypto.randomUUID();
            const claim = await db.rpc("claim_notification", {
              p_user: account.user_id,
              p_kind: kind,
              p_period: period,
              p_owner: owner,
            });
            if (claim.error) throw claim.error;
            if (!claim.data) continue;
            const user = await db
              .from("users")
              .select("line_user_id")
              .eq("id", account.user_id)
              .single();
            if (user.error) throw user.error;
            // Recheck opt-in immediately before sending; the claim remains recoverable on failure.
            const prefs = await db
              .from("notification_preferences")
              .select("daily,monthly,budget")
              .eq("user_id", account.user_id)
              .single();
            if (prefs.error) throw prefs.error;
            if (!prefs.data[kind]) continue;
            await push(
              user.data.line_user_id,
              [
                text(body, [
                  { type: "uri", label: "เปิดแอป", uri: appUrl("/app/reports") },
                ]),
              ],
              claim.data,
            );
            const updated = await db
              .from("notification_deliveries")
              .update({ state: "sent" })
              .eq("id", claim.data)
              .eq("owner", owner)
              .eq("state", "processing")
              .select("id");
            if (updated.error || !updated.data?.length)
              throw new Error("Notification owner changed");
            sent++;
          } catch {
            failed++;
            console.error("Notification delivery failed");
          }
        }
      }
    }),
  );
  return {
    sent,
    failed,
    processed: accounts.length,
    nextCursor:
      accounts.length === 10 ? accounts[accounts.length - 1].user_id : null,
  };
}
