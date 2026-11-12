// All "days until payday" and "today" logic uses Thai time, never the server's clock zone.
export const TIME_ZONE = "Asia/Bangkok";

const MS_PER_DAY = 86_400_000;

// Thai calendar date (YYYY-MM-DD) for an instant; en-CA formats as ISO date.
export function thaiDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Whole days from `from` to `to` (to - from); negative if `to` is earlier.
// Both are UTC midnights, so there is no DST drift.
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

// Calendar date `n` days after `date` (YYYY-MM-DD).
export function addDays(date: string, n: number): string {
  return new Date(toUtcMs(date) + n * MS_PER_DAY).toISOString().slice(0, 10);
}
