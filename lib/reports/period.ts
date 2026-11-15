import { HttpError } from "@/lib/http";
import { addDays, thaiDate } from "@/lib/calc/time";

export function reportRange(period: string, date?: string, now = new Date()) {
  const asOf = thaiDate(now);
  const anchor = date ?? asOf;
  const stamp = new Date(`${anchor}T00:00:00Z`);
  if (
    !["day", "week", "month"].includes(period) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(anchor) ||
    !Number.isFinite(stamp.getTime()) ||
    stamp.toISOString().slice(0, 10) !== anchor ||
    anchor > asOf ||
    anchor < "2000-01-01"
  ) {
    throw new HttpError(
      422,
      "invalid_period",
      "เลือกวันหรือเดือนที่ถูกต้อง และไม่เกินวันนี้ครับ",
    );
  }
  // A week is Monday to Sunday (the team's choice, 15 Nov): the Monday on or before the date
  const weekday = (stamp.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const from = period === "month" ? `${anchor.slice(0, 7)}-01` : period === "week" ? addDays(anchor, -weekday) : anchor;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return {
    period: period as "day" | "week" | "month",
    from,
    until:
      period === "day" ? addDays(from, 1) : period === "week" ? addDays(from, 7) : next.toISOString().slice(0, 10),
    asOf,
  };
}
