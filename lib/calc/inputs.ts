import { thaiDate } from "@/lib/calc/time";
import { floorToBaht, type Satang } from "@/lib/calc/money";

// Turns stored rows into BudgetInput fields. Pure, like the calculator, so the rules are testable without a DB.

// A balance the user reported and when it was true: the cycle start, or a later "ปรับยอด".
export interface BalanceAnchor {
  amount: Satang;
  asOf: Date;
}

export interface EntryLike {
  amount: Satang;
  spentOn: string; // YYYY-MM-DD Thai
  createdAt: Date;
  fromPlan?: boolean; // created by paying a plan (source = 'plan')
}

export interface PlanLike {
  amount: Satang;
  status: "reserved" | "postponed" | "paid" | "cancelled" | "separate";
  dueOn: string | null; // YYYY-MM-DD
}

export function latestAnchor(start: BalanceAnchor, checks: BalanceAnchor[]): BalanceAnchor {
  return checks.reduce((latest, c) => (c.asOf > latest.asOf ? c : latest), start);
}

// Money on hand now. Only entries logged after the anchor, for its day or later, come off it:
// anything else was already spent when the user read that balance, so it must not be taken twice.
export function balanceNow(anchor: BalanceAnchor, entries: EntryLike[]): Satang {
  const anchorDay = thaiDate(anchor.asOf);
  return entries
    .filter((e) => e.createdAt > anchor.asOf && e.spentOn >= anchorDay)
    .reduce((left, e) => left - e.amount, anchor.amount);
}

// Spending that counts against one day's budget. A paid plan is left out: its money was
// held back as reserved, so paying it moves money from reserved to spent, not into today.
export function spentOnDay(entries: EntryLike[], day: string): Satang {
  return entries.filter((e) => e.spentOn === day && !e.fromPlan).reduce((sum, e) => sum + e.amount, 0);
}

// Paid, cancelled, separately paid and postponed plans hold nothing back; items due after payday belong to the next cycle.
export function heldThisCycle(plan: Pick<PlanLike, "status" | "dueOn">, payday: string): boolean {
  return plan.status === "reserved" && (plan.dueOn === null || plan.dueOn <= payday);
}

export function reservedTotal(plans: PlanLike[], payday: string): Satang {
  return plans.filter((p) => heldThisCycle(p, payday)).reduce((sum, p) => sum + p.amount, 0);
}

export function savingsFromPercent(startBalance: Satang, percent: number): Satang {
  return floorToBaht((startBalance * percent) / 100);
}
