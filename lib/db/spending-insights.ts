import { getDb } from "./client";
import { reportReads } from "./report-reads";
import { addDays, thaiDate } from "@/lib/calc/time";
import { analyzeSpending } from "@/lib/insights/analyze";
import type { SpendingInsights } from "@/lib/insights/types";
import { HttpError } from "@/lib/http";
export async function spendingInsights(
  userId: string,
  now = new Date(),
): Promise<SpendingInsights> {
  const today = thaiDate(now);
  const { data, error } = await reportReads.run(
    async () =>
      await getDb()
        .rpc("spending_insights", { p_user: userId, p_today: today })
        .abortSignal(AbortSignal.timeout(5000)),
  );
  if (error) throw error;
  function safe(v: unknown): void {
    if (typeof v === "number" && !Number.isSafeInteger(v))
      throw new HttpError(503, "unsafe_total", "ยอดรวมเกินขอบเขตที่แสดงได้ครับ");
    if (v && typeof v === "object") Object.values(v).forEach(safe);
  }
  safe(data);
  return analyzeSpending({
    ...data,
    from: addDays(today, -29),
    until: addDays(today, 1),
    monthFrom: `${today.slice(0, 7)}-01`,
  });
}
