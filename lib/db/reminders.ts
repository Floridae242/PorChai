import type { UserCategory } from "@/lib/api-types";
import { addDays, thaiDate } from "@/lib/calc/time";
import { requireActiveCycle } from "@/lib/db/budget";
import { getDb } from "@/lib/db/client";
import { dueHabit, findHabits, type EntryForHabit, type Habit } from "@/lib/remind/habits";
import type { ReminderSettingsChange } from "@/lib/validate";

// Card 58 (migration 20261113100000_reminders). Settings for the screen, the habits found, and the
// reminder_log rows that keep a habit to one reminder a day.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULTS: ReminderSettingsChange = { enabled: false, time: "12:30", pausedUntil: null };

// The screen's shape (lib/client/types.ts ReminderSettings)
export interface ReminderSettings extends ReminderSettingsChange {
  habits: { id: string; label: string; amount: number; time: string }[];
}

export interface ReminderLog {
  id: string;
  label: string;
  amount: number;
  category: UserCategory;
  day: string;
  status: "sent" | "recorded" | "skipped";
}

const LOG_COLUMNS = "id, label, amount, category, day, status";

export const thaiTime = (now: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);

async function settingsOf(userId: string): Promise<ReminderSettingsChange> {
  const { data, error } = await getDb()
    .from("reminder_settings")
    .select("enabled, remind_at, paused_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULTS;
  return { enabled: data.enabled, time: String(data.remind_at).slice(0, 5), pausedUntil: data.paused_until };
}

// The last 7 days and today: enough to find habits and see what is recorded today
async function recentEntries(userId: string, today: string): Promise<EntryForHabit[]> {
  const { data, error } = await getDb()
    .from("entries")
    .select("note, amount, category, spent_on, created_at, source, cancelled_at")
    .eq("user_id", userId)
    .gte("spent_on", addDays(today, -7));
  if (error) throw error;
  return data.map((r) => ({
    note: r.note,
    amount: r.amount,
    category: r.category,
    spentOn: r.spent_on,
    createdAt: r.created_at,
    source: r.source,
    cancelled: r.cancelled_at !== null,
  }));
}

export async function habitsOf(userId: string, today: string): Promise<{ habits: Habit[]; entries: EntryForHabit[] }> {
  const entries = await recentEntries(userId, today);
  return { habits: findHabits(entries, today), entries };
}

export async function getReminderSettings(userId: string, now = new Date()): Promise<ReminderSettings> {
  const [settings, { habits }] = await Promise.all([settingsOf(userId), habitsOf(userId, thaiDate(now))]);
  return { ...settings, habits: habits.map((h) => ({ id: h.key, label: h.label, amount: h.amount, time: h.time })) };
}

export async function saveReminderSettings(userId: string, s: ReminderSettingsChange): Promise<ReminderSettings> {
  const { error } = await getDb()
    .from("reminder_settings")
    .upsert({ user_id: userId, enabled: s.enabled, remind_at: s.time, paused_until: s.pausedUntil, updated_at: new Date().toISOString() });
  if (error) throw error;
  return getReminderSettings(userId);
}

// Today's row for this habit: the existing one, or a new one. `created` = this call made it, so only
// one of two runs at the same moment sends the reminder.
async function logFor(userId: string, h: Habit, day: string): Promise<{ log: ReminderLog; created: boolean }> {
  const db = getDb();
  const { data, error } = await db
    .from("reminder_log")
    .insert({ user_id: userId, habit_key: h.key, label: h.label, amount: h.amount, category: h.category, day })
    .select(LOG_COLUMNS)
    .single();
  if (!error) return { log: data as ReminderLog, created: true };
  if (error.code !== "23505") throw error;
  const existing = await db.from("reminder_log").select(LOG_COLUMNS).eq("user_id", userId).eq("habit_key", h.key).eq("day", day).single();
  if (existing.error) throw existing.error;
  return { log: existing.data as ReminderLog, created: false };
}

export async function forgetReminder(id: string): Promise<void> {
  const { error } = await getDb().from("reminder_log").delete().eq("id", id);
  if (error) throw error;
}

// The scheduler's run: everyone who turned reminders on, is not paused, whose time has come and who
// has a habit not yet recorded, reminded or skipped today
export async function dueReminders(now = new Date()): Promise<{ lineUserId: string; log: ReminderLog; time: string }[]> {
  const today = thaiDate(now);
  const time = thaiTime(now);
  const { data, error } = await getDb()
    .from("reminder_settings")
    .select("user_id, remind_at, paused_until, users!inner(line_user_id)")
    .eq("enabled", true);
  if (error) throw error;
  const due: { lineUserId: string; log: ReminderLog; time: string }[] = [];
  for (const row of data as unknown as { user_id: string; remind_at: string; paused_until: string | null; users: { line_user_id: string } }[]) {
    if (row.paused_until && row.paused_until >= today) continue;
    const remindAt = String(row.remind_at).slice(0, 5);
    const { habits, entries } = await habitsOf(row.user_id, today);
    const { data: logs, error: logError } = await getDb().from("reminder_log").select("habit_key").eq("user_id", row.user_id).eq("day", today);
    if (logError) throw logError;
    const habit = dueHabit(habits, entries.filter((e) => e.spentOn === today), remindAt, time, new Set(logs.map((l) => l.habit_key)));
    if (!habit) continue;
    const { log, created } = await logFor(row.user_id, habit, today);
    if (created) due.push({ lineUserId: row.users.line_user_id, log, time: remindAt });
  }
  return due;
}

// Demo command: the first habit right now, whatever the time or settings (null = no habit yet)
export async function demoReminder(userId: string, now = new Date()): Promise<{ log: ReminderLog; time: string } | null> {
  const today = thaiDate(now);
  const { habits } = await habitsOf(userId, today);
  if (habits.length === 0) return null;
  const { log } = await logFor(userId, habits[0], today);
  return { log, time: habits[0].time };
}

// Demo command «เดโมเตรียม» (DEMO_MODE only, user's choice 13 Nov): ข้าวเที่ยง 50 at 12:10 on the last 3
// days of the presenter's own account, so «เดโมเตือน» has a habit. Real spends in the cycle (agreed: it is a
// demo account). Keyed by day, so running it twice adds nothing.
export const DEMO_HABIT = { title: "ข้าวเที่ยง", amount: 5000, time: "12:10" };

export async function seedDemoHabit(userId: string, now = new Date()): Promise<void> {
  const cycle = await requireActiveCycle(userId); // no cycle → the caller says set it up first
  const today = thaiDate(now);
  const rows = [1, 2, 3].map((n) => {
    const day = addDays(today, -n);
    return {
      user_id: userId,
      cycle_id: cycle.id,
      amount: DEMO_HABIT.amount,
      category: "food",
      note: DEMO_HABIT.title,
      spent_on: day,
      source: "chat",
      idempotency_key: `demo-habit:${day}`,
      created_at: new Date(`${day}T${DEMO_HABIT.time}:00+07:00`).toISOString(),
    };
  });
  const { error } = await getDb().from("entries").upsert(rows, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
  if (error) throw error;
}

// A reminder card's button: the owner's row only
export async function reminderById(userId: string, id: string): Promise<ReminderLog | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await getDb().from("reminder_log").select(LOG_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as ReminderLog | null;
}

export async function markReminder(id: string, status: "recorded" | "skipped", entryId: string | null = null): Promise<void> {
  const { error } = await getDb().from("reminder_log").update({ status, ...(entryId && { entry_id: entryId }) }).eq("id", id);
  if (error) throw error;
}
