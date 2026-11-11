import { daysBetween } from "@/lib/calc/time";
import { floorToBaht, type Satang } from "@/lib/calc/money";

export interface BudgetInput {
  startBalance: Satang; // cycle start (or last adjustment)
  spentBeforeToday: Satang; // entries in cycle with spent_on < today
  spentToday: Satang; // entries with spent_on = today
  emergencyBuffer: Satang;
  reserved: Satang; // reserved bills + planned purchases
  today: string; // YYYY-MM-DD Thai
  payday: string; // YYYY-MM-DD
}

export type BudgetResult =
  | { kind: "ok"; usable: Satang; dailyBudget: Satang; todayRemaining: Satang; daysLeft: number }
  | { kind: "shortfall"; usable: Satang; shortfall: Satang; daysLeft: number }
  | { kind: "payday-passed"; usable: Satang };

// The single budget calculator; every entrance (chat, screens, reminders, AI) goes through it.
export function computeBudget(input: BudgetInput): BudgetResult {
  const usable =
    input.startBalance - input.spentBeforeToday - input.spentToday - input.emergencyBuffer - input.reserved;
  const daysLeft = daysBetween(input.today, input.payday);

  // Checked first: with no days left there is nothing to divide by.
  if (daysLeft <= 0) return { kind: "payday-passed", usable };
  if (usable < 0) return { kind: "shortfall", usable, shortfall: -usable, daysLeft };

  // Today's spending is added back so the daily budget stays stable as the day goes on.
  const dailyBudget = floorToBaht((usable + input.spentToday) / daysLeft);
  return { kind: "ok", usable, dailyBudget, todayRemaining: dailyBudget - input.spentToday, daysLeft };
}

// What-if: reserve `amount` more. Builds a new input, never touches the original.
export function simulatePurchase(input: BudgetInput, amount: Satang): BudgetResult {
  return computeBudget({ ...input, reserved: input.reserved + amount });
}
