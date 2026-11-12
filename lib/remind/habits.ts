import type { UserCategory } from "@/lib/api-types";
import { addDays } from "@/lib/calc/time";

// Card 58: spending habits from the entries the user confirmed. Pure, so every rule is a unit test.
// A habit = the same item name on at least 3 of the last 7 days (Figma F2: "ดูจากรายการที่ยืนยันแล้ว 3 วันขึ้นไป",
// user's choice 13 Nov). Reminded once a day at the user's time (settings, default 12:30).

const MIN_DAYS = 3;
const WINDOW_DAYS = 7;

export interface EntryForHabit {
  note: string | null;
  amount: number; // satang
  category: UserCategory | "bills";
  spentOn: string; // YYYY-MM-DD
  createdAt: string; // ISO
  source: "chat" | "form" | "plan" | "reminder" | "ocr";
  cancelled?: boolean;
}

export interface Habit {
  key: string; // habitKey(label)
  label: string; // as the user last wrote it
  amount: number; // the usual amount (median)
  category: UserCategory;
  time: string; // HH:mm Thai time, the usual time it is recorded (median)
  days: number; // days with it in the last 7
}

export const habitKey = (note: string) => note.trim().toLowerCase().replace(/\s+/g, " ");

// Thai time of day (UTC+7, no daylight saving)
function thaiMinutes(iso: string): number {
  const d = new Date(iso);
  return ((d.getUTCHours() + 7) % 24) * 60 + d.getUTCMinutes();
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
// The lower middle, so one big day does not pull the usual amount up
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[(xs.length - 1) >> 1];

// Confirmed spends only: plan payments are not daily habits, cancelled ones never happened
const counts = (x: EntryForHabit) => !x.cancelled && x.source !== "plan" && x.category !== "bills" && !!x.note?.trim();

export function findHabits(entries: EntryForHabit[], today: string): Habit[] {
  const from = addDays(today, -WINDOW_DAYS);
  const groups = new Map<string, EntryForHabit[]>();
  for (const x of entries) {
    if (!counts(x) || x.spentOn < from || x.spentOn >= today) continue;
    const k = habitKey(x.note!);
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  const habits: Habit[] = [];
  for (const [key, xs] of groups) {
    const days = new Set(xs.map((x) => x.spentOn)).size;
    if (days < MIN_DAYS) continue;
    const latest = [...xs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)!;
    habits.push({
      key,
      label: latest.note!.trim(),
      amount: median(xs.map((x) => x.amount)),
      category: latest.category as UserCategory,
      time: hhmm(median(xs.map((x) => thaiMinutes(x.createdAt)))),
      days,
    });
  }
  return habits.sort((a, b) => b.days - a.days || a.time.localeCompare(b.time));
}

// The one habit to remind now, or null. `now` and `remindAt` are HH:mm Thai time. A habit usually
// recorded after the reminder time is not missing yet. `done` = keys already reminded, recorded or
// skipped today (reminder_log), so none is reminded twice.
export function dueHabit(
  habits: Habit[],
  todayEntries: EntryForHabit[],
  remindAt: string,
  now: string,
  done: Set<string> = new Set(),
): Habit | null {
  if (minutesOf(now) < minutesOf(remindAt)) return null;
  const recorded = new Set(todayEntries.filter((x) => !x.cancelled && x.note).map((x) => habitKey(x.note!)));
  return habits.find((h) => minutesOf(h.time) <= minutesOf(remindAt) && !done.has(h.key) && !recorded.has(h.key)) ?? null;
}
