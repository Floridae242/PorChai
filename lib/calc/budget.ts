import { addDays, daysBetween } from "@/lib/calc/time";
import { floorToBaht, type Satang } from "@/lib/calc/money";

export interface BudgetInput {
  balance: Satang; // money on hand now (see balanceNow in lib/calc/inputs)
  spentToday: Satang; // all entries with spent_on = today
  emergencyBuffer: Satang;
  savings: Satang; // set aside at cycle start, never spendable
  reserved: Satang; // unpaid bills + planned purchases due by payday (see reservedTotal)
  essentialPerDay: Satang | null; // food + transport a day; null = the user has not said (never guessed)
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
      // These three need essentialPerDay; null = unknown, so ask for it before answering (card 14)
      spare: Satang | null; // left after the essentials to payday; negative = that much short
      maxPurchase: Satang | null; // most one item can cost and still leave the essentials every day
      essentialShortPerDay: Satang | null; // how far the daily budget falls below the essentials
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
  const essential = input.essentialPerDay;
  const spare = essential === null ? null : floorToBaht(usableAtDayStart - essential * daysLeft);
  return {
    kind: "ok",
    usable,
    dailyBudget,
    todayRemaining: dailyBudget - input.spentToday,
    daysLeft,
    spare,
    maxPurchase: spare === null ? null : Math.max(0, spare),
    essentialShortPerDay: essential === null ? null : Math.max(0, essential - dailyBudget),
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

// What must be asked before a try can be answered (card 14 / 03)
export type Missing = "essentials" | "payday";

// ok = fits, essentials still covered every day · essentials_short = affordable, but the daily budget
// falls below food + transport (W14) · shortfall = not even the bills, savings and buffer are covered ·
// ask = something in `needs` must be answered first
export type TrialVerdict = "ok" | "essentials_short" | "shortfall" | "ask";

export interface TrialResult {
  verdict: TrialVerdict;
  needs: Missing[];
  before: BudgetResult | null;
  after: BudgetResult | null;
  overLimitBy: Satang | null; // how far past the purchase limit (W14 "เกินวงเงิน"); null if short or asking
}

// Try buying `buy` (held this cycle), postponing held plans worth `release`, a new emergency buffer
// (card 19), a later payday or a corrected balance (card 23), without saving anything.
// Only `after` sees the change.
export function tryOut(
  input: BudgetInput,
  change: {
    buy: Satang;
    release: Satang;
    emergencyBuffer?: Satang;
    payday?: string;
    balance?: Satang;
    reserved?: Satang; // held plans re-counted for a moved payday (default: input.reserved)
  },
): TrialResult {
  const needs: Missing[] = [];
  if (input.essentialPerDay === null) needs.push("essentials");
  if (daysBetween(input.today, input.payday) <= 0) needs.push("payday");
  if (needs.length > 0) return { verdict: "ask", needs, before: null, after: null, overLimitBy: null };

  const before = computeBudget(input);
  const after = computeBudget({
    ...input,
    reserved: (change.reserved ?? input.reserved) + change.buy - change.release,
    emergencyBuffer: change.emergencyBuffer ?? input.emergencyBuffer,
    payday: change.payday ?? input.payday, // card 23: more days to cover with the same money
    balance: change.balance ?? input.balance,
  });
  if (after.kind !== "ok") return { verdict: "shortfall", needs, before, after, overLimitBy: null };
  // Both are known here: essentials were checked above
  const spare = after.spare!;
  return { verdict: spare < 0 ? "essentials_short" : "ok", needs, before, after, overLimitBy: Math.max(0, -spare) };
}
