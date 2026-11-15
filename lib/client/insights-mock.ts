import type { Entry } from "@/lib/api-types";
import type { SpendingCategory, SpendingInsights } from "@/lib/insights/types";
import { analyzeSpending } from "@/lib/insights/analyze";
import { addDays } from "@/lib/calc/time";
export function mockSpendingInsights(
  entries: Entry[],
  categories: SpendingCategory[],
  today: string,
): SpendingInsights {
  const from = addDays(today, -29),
    monthFrom = `${today.slice(0, 7)}-01`,
    recent = entries.filter((e) => e.spentOn >= from && e.spentOn <= today),
    month = entries.filter((e) => e.spentOn >= monthFrom && e.spentOn <= today);
  const sum = (rows: Entry[]) => rows.reduce((s, e) => s + e.amount, 0);
  const grouped = new Map<string, Entry[]>();
  for (const e of recent)
    if (e.note?.trim())
      grouped.set(e.note.trim(), [...(grouped.get(e.note.trim()) ?? []), e]);
  return analyzeSpending({
    from,
    until: addDays(today, 1),
    monthFrom,
    total: sum(recent),
    count: recent.length,
    activeDays: new Set(recent.map((e) => e.spentOn)).size,
    recentWeek: sum(recent.filter((e) => e.spentOn >= addDays(today, -6))),
    previousWeek: sum(
      recent.filter(
        (e) =>
          e.spentOn >= addDays(today, -13) && e.spentOn < addDays(today, -6),
      ),
    ),
    categories: categories.map((c) => {
      const rows = month.filter((e) =>
          c.id === c.parent ? e.category === c.parent : e.categoryId === c.id,
        ),
        spent = sum(rows);
      return {
        ...c,
        spent,
        count: rows.length,
        remaining: c.monthlyBudget === null ? null : c.monthlyBudget - spent,
      };
    }),
    weekdays: Array.from({ length: 7 }, (_, day) => {
      const rows = recent.filter(
        (e) => new Date(`${e.spentOn}T00:00:00Z`).getUTCDay() === day,
      );
      return {
        day,
        amount: sum(rows),
        count: rows.length,
        activeDays: new Set(rows.map((e) => e.spentOn)).size,
      };
    }).filter((x) => x.count),
    recurring: [...grouped]
      .map(([label, rows]) => ({
        label,
        amount: sum(rows),
        count: rows.length,
        days: new Set(rows.map((e) => e.spentOn)).size,
      }))
      .filter((x) => x.days >= 3)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 5),
  });
}
