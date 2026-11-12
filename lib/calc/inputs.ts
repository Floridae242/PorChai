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

// Money received («รับ 500», the app's รายรับ). Never a future day: money not yet in is not money to use today.
export interface IncomeLike {
  amount: Satang;
  receivedOn: string; // YYYY-MM-DD Thai
  createdAt: Date;
}

// Money on hand now. Only entries and income logged after the anchor, for its day or later, change it:
// anything else was already in the balance the user read, so it must not be counted twice.
export function balanceNow(anchor: BalanceAnchor, entries: EntryLike[], incomes: IncomeLike[] = []): Satang {
  const anchorDay = thaiDate(anchor.asOf);
  const after = (createdAt: Date, day: string) => createdAt > anchor.asOf && day >= anchorDay;
  const spent = entries.filter((e) => after(e.createdAt, e.spentOn)).reduce((sum, e) => sum + e.amount, 0);
  const received = incomes.filter((i) => after(i.createdAt, i.receivedOn)).reduce((sum, i) => sum + i.amount, 0);
  return anchor.amount - spent + received;
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

// Savings and buffer are set aside from the money on hand, so together they can never exceed it (card 19)
export function setAsideFits(balance: Satang, savings: Satang, buffer: Satang): boolean {
  return savings + buffer <= balance;
}
