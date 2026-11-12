import type { Satang } from "@/lib/calc/money";
import type { DailySpendDay } from "./types";

export interface DailyBarItem {
  date: string;
  dayNumber: number;
  spent: Satang | null; // null = future day
  isToday: boolean;
  over: boolean; // decided by the server
  heightPercent: number;
}

// The only arithmetic on satang in the summary: a ratio used to DRAW bar heights. It never produces
// money that is shown. Per-day totals and the over-budget flag come from the server (api.dailySpend()).
export function buildDailyBars(days: DailySpendDay[], today: string, dailyBudget: Satang | null): DailyBarItem[] {
  const spentValues = days.map((d) => d.spent ?? 0);
  const scale = Math.max(dailyBudget === null ? 0 : dailyBudget * 1.5, ...spentValues, 100);
  return days.map((day, i) => ({
    date: day.date,
    dayNumber: i + 1,
    spent: day.spent,
    isToday: day.date === today,
    over: day.over,
    heightPercent:
      day.spent === null || day.spent === 0 ? 6 : Math.min(100, Math.max(12, Math.round((day.spent / scale) * 100))),
  }));
}
