import { addDays, daysBetween } from "@/lib/calc/time";
import { floorToBaht, type Satang } from "@/lib/calc/money";

export interface BudgetInput {
  balance: Satang; // money on hand now (see balanceNow in lib/calc/inputs)
  spentToday: Satang; // all entries with spent_on = today
  emergencyBuffer: Satang;
  savings: Satang; // set aside at cycle start, never spendable
  reserved: Satang; // unpaid bills + planned purchases due by payday (see reservedTotal)
  essentialPerDay: Satang; // food + transport the user needs each day
  today: string; // YYYY-MM-DD Thai
  payday: string; // YYYY-MM-DD
}

export type BudgetResult =
  | {
      kind: "ok";
      usable: Satang;
      dailyBudget: Satang;
      todayRemaining: Satang;
      daysLeft: number;
      maxPurchase: Satang; // most one item can cost and still leave the essentials every day
      essentialShortPerDay: Satang; // how far the daily budget falls below the essentials (0 if it does not)
    }
  | { kind: "shortfall"; usable: Satang; shortfall: Satang; daysLeft: number }
  | { kind: "payday-passed"; usable: Satang };

// The single budget calculator; every entrance (chat, screens, reminders, AI) goes through it.
export function computeBudget(input: BudgetInput): BudgetResult {
  const usable = input.balance - input.emergencyBuffer - input.savings - input.reserved;
  const daysLeft = daysBetween(input.today, input.payday);

  // Checked first: with no days left there is nothing to divide by.
  if (daysLeft <= 0) return { kind: "payday-passed", usable };
  if (usable < 0) return { kind: "shortfall", usable, shortfall: -usable, daysLeft };

  // Today's spending is added back so the daily budget and purchase limit stay stable as the day goes on.
  const usableAtDayStart = usable + input.spentToday;
  const dailyBudget = floorToBaht(usableAtDayStart / daysLeft);
  return {
    kind: "ok",
    usable,
    dailyBudget,
    todayRemaining: dailyBudget - input.spentToday,
    daysLeft,
    maxPurchase: Math.max(0, floorToBaht(usableAtDayStart - input.essentialPerDay * daysLeft)),
    essentialShortPerDay: Math.max(0, input.essentialPerDay - dailyBudget),
  };
}

// What-if: reserve `amount` more. Builds a new input, never touches the original.
export function simulatePurchase(input: BudgetInput, amount: Satang): BudgetResult {
  return computeBudget({ ...input, reserved: input.reserved + amount });
}

// Tomorrow's budget once today is over: today's spending is no longer added back.
export function tomorrowBudget(input: BudgetInput): BudgetResult {
  return computeBudget({ ...input, today: addDays(input.today, 1), spentToday: 0 });
}
