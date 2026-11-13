import { addDays } from "@/lib/calc/time";

// "Every week on <weekday>" or "every month on day <n>" -> the date of the NEXT payday after today.
// Today never counts: if today already is the payday, the next one is a week / a month away, because a
// payday must be after today (the cycle is counted from today to payday).
export type PaydayRule = { kind: "weekly"; weekday: number } | { kind: "monthly"; day: number };

export const WEEKDAY_NAMES_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;

// Mon..Sun in the order they are shown; values are Date#getUTCDay numbers (0 = Sunday).
export const WEEKDAY_CHOICES = [1, 2, 3, 4, 5, 6, 0] as const;

function parts(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`date must be YYYY-MM-DD, got "${date}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// 0 = Sunday .. 6 = Saturday, for a Thai calendar date (UTC midnight: no timezone drift).
export function weekdayOf(date: string): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1..12
}

function ymd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function nextPayday(rule: PaydayRule, today: string): string {
  if (rule.kind === "weekly") {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
      throw new RangeError("weekday must be 0..6");
    }
    const diff = (rule.weekday - weekdayOf(today) + 7) % 7;
    return addDays(today, diff === 0 ? 7 : diff);
  }
  if (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31) {
    throw new RangeError("day must be 1..31");
  }
  const [y, m] = parts(today);
  // A short month uses its last day (the 31st in February -> 28th/29th).
  const thisMonth = ymd(y, m, Math.min(rule.day, daysInMonth(y, m)));
  if (thisMonth > today) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return ymd(ny, nm, Math.min(rule.day, daysInMonth(ny, nm)));
}
