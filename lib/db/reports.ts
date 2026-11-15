import { addDays } from "@/lib/calc/time";
import { getDb } from "./client";
import { reportReads } from "./report-reads";
import { reportRange } from "@/lib/reports/period";
import type { FinanceReport } from "@/lib/reports/types";

export async function loadReport(
  userId: string,
  period: string,
  date?: string,
  now = new Date(),
): Promise<FinanceReport> {
  const range = reportRange(period, date, now);
  const { data, error } = await reportReads.run(
    async () =>
      await getDb()
        .rpc("finance_report", {
          p_user: userId,
          p_from: range.from,
          p_until: range.until,
          p_asof: range.asOf,
        })
        .abortSignal(AbortSignal.timeout(5000)),
  );
  if (error) throw error;
  const assertSafe = (value: unknown): void => {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw new Error("Report total exceeds safe integer range");
    if (value && typeof value === "object")
      for (const child of Object.values(value)) assertSafe(child);
  };
  assertSafe(data);
  const daily = new Map<string, { spent: number; income: number }>(
    data.days.map((d: { date: string; spent: number; income: number }) => [
      d.date,
      d,
    ]),
  );
  const days: FinanceReport["days"] = [];
  for (let day = range.from; day < range.until; day = addDays(day, 1)) {
    const totals = daily.get(day);
    days.push({
      date: day,
      spent: day > range.asOf ? null : (totals?.spent ?? 0),
      income: day > range.asOf ? null : (totals?.income ?? 0),
    });
  }
  return { ...range, ...data, days };
}
