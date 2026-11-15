import { addDays } from "@/lib/calc/time";
import { reportRange } from "@/lib/reports/period";
import type { FinanceReport } from "@/lib/reports/types";
export function mockReport(
  period: "day" | "month",
  date: string | undefined,
  today: string,
  entries: {
    amount: number;
    category: FinanceReport["categories"][number]["category"];
    spentOn: string;
    cancelledAt: unknown;
  }[],
  incomes: { amount: number; receivedOn: string }[],
): FinanceReport {
  const range = reportRange(period, date, new Date(`${today}T05:00:00Z`));
  const rows = entries.filter(
    (e) =>
      !e.cancelledAt &&
      e.spentOn >= range.from &&
      e.spentOn < range.until &&
      e.spentOn <= today,
  );
  const ins = incomes.filter(
    (i) =>
      i.receivedOn >= range.from &&
      i.receivedOn < range.until &&
      i.receivedOn <= today,
  );
  const categories = new Map<string, FinanceReport["categories"][number]>();
  const dayMap = new Map<string, { spent: number; income: number }>();
  for (const e of rows) {
    const c = categories.get(e.category) ?? {
      category: e.category,
      amount: 0,
      count: 0,
    };
    c.amount += e.amount;
    c.count++;
    categories.set(e.category, c);
    const d = dayMap.get(e.spentOn) ?? { spent: 0, income: 0 };
    d.spent += e.amount;
    dayMap.set(e.spentOn, d);
  }
  for (const i of ins) {
    const d = dayMap.get(i.receivedOn) ?? { spent: 0, income: 0 };
    d.income += i.amount;
    dayMap.set(i.receivedOn, d);
  }
  const spending = rows.reduce((s, e) => s + e.amount, 0),
    income = ins.reduce((s, i) => s + i.amount, 0);
  const days: FinanceReport["days"] = [];
  for (let d = range.from; d < range.until; d = addDays(d, 1))
    days.push({
      date: d,
      spent: d > today ? null : (dayMap.get(d)?.spent ?? 0),
      income: d > today ? null : (dayMap.get(d)?.income ?? 0),
    });
  return {
    ...range,
    spending,
    income,
    net: income - spending,
    entriesCount: rows.length,
    categories: [...categories.values()].sort((a, b) => b.amount - a.amount),
    days,
  };
}
