import type { Category, Entry, Summary } from "@/lib/api-types";
import type { Satang } from "@/lib/calc/money";
import { addDays } from "@/lib/calc/time";
import { CYCLE_DAYS } from "./mock-fixtures";

export const CATEGORY_LABELS: Record<Category, string> = {
  food: "อาหารและเครื่องดื่ม",
  transport: "เดินทาง",
  supplies: "ของใช้และเรียน",
  other: "อื่น ๆ",
  bills: "บิลประจำ",
};

export interface DailyBarItem {
  date: string;
  dayNumber: number;
  spent: Satang | null; // null = future day
  isToday: boolean;
  over: boolean;
  heightPercent: number;
}

export function buildCycleDailyBars(summary: Summary, entries: Entry[]): DailyBarItem[] {
  const dailyBudget = summary.budget.kind === "ok" ? summary.budget.dailyBudget : 12000;
  const startDay = addDays(summary.payday, -CYCLE_DAYS);
  const byDay = new Map<string, Satang>();

  for (const e of entries) {
    if (e.source === "plan") continue;
    byDay.set(e.spentOn, (byDay.get(e.spentOn) ?? 0) + e.amount);
  }

  const maxScale = Math.max(dailyBudget * 1.5, ...Array.from(byDay.values()), 100);
  const bars: DailyBarItem[] = [];

  for (let i = 0; i < CYCLE_DAYS; i++) {
    const date = addDays(startDay, i);
    const isFuture = date > summary.today;
    const spent = isFuture ? null : (byDay.get(date) ?? 0);
    const over = spent !== null && summary.budget.kind === "ok" && spent > dailyBudget;
    const heightPercent = spent === null || spent === 0 ? 6 : Math.min(100, Math.max(12, Math.round((spent / maxScale) * 100)));
    bars.push({
      date,
      dayNumber: i + 1,
      spent,
      isToday: date === summary.today,
      over,
      heightPercent,
    });
  }
  return bars;
}

export interface CategoryTotalItem {
  category: Category;
  label: string;
  amount: Satang;
  count: number;
}

export function summarizeCategories(entries: Entry[]): CategoryTotalItem[] {
  const totals = new Map<Category, { amount: Satang; count: number }>();
  for (const e of entries) {
    const prev = totals.get(e.category) ?? { amount: 0, count: 0 };
    totals.set(e.category, { amount: prev.amount + e.amount, count: prev.count + 1 });
  }
  return Array.from(totals.entries())
    .map(([category, v]) => ({
      category,
      label: CATEGORY_LABELS[category],
      amount: v.amount,
      count: v.count,
    }))
    .sort((a, b) => b.amount - a.amount);
}
