import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { createCycle } from "@/lib/db/cycle";
import { addEntry } from "@/lib/db/entries";
import { addIncome } from "@/lib/db/income";
import { actOnPlan, addPlan } from "@/lib/db/plans";
import { remember } from "@/lib/db/chat-memory";
import { saveReminderSettings } from "@/lib/db/reminders";
import { saveNotificationPreferences } from "@/lib/db/notifications";
import { claimDailyPoints, redeemReward } from "@/lib/db/rewards";
import { userIdForLine } from "@/lib/db/users";
import { parseNewCycle } from "@/lib/validate";
import { addDays, thaiDate } from "@/lib/calc/time";
import type { VerifyResult } from "@/lib/line/id-token";
import { DELETE } from "./route";

// ลบข้อมูลของฉัน (settings → ลบข้อมูลทั้งหมด): every row of that account goes, in one transaction.
// Shared data (rewards, price_hints) and other accounts stay.

vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> =>
    token === "bad" ? { ok: false, reason: "invalid" } : { ok: true, lineUserId: token },
  ),
}));

const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_del_A_${run}`;
const lineB = `U_del_B_${run}`;
const rewards: string[] = [];
const today = () => thaiDate(new Date());

// Every table that holds a user's rows
const USER_TABLES = [
  "cycles", "entries", "incomes", "plans", "history", "balance_checks", "chat_drafts", "chat_messages",
  "reminder_settings", "reminder_log", "points_wallets", "points_ledger", "reward_claims",
  "notification_preferences", "notification_deliveries",
];

const call = (token?: string) =>
  DELETE(
    new Request("http://localhost/api/me", {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );

// An account with something in every kind of table, including a paid bill (its entry points back at the plan)
async function fullAccount(lineUserId: string): Promise<string> {
  const id = await userIdForLine(lineUserId);
  await createCycle(
    id,
    parseNewCycle(
      { incomeSource: "family", incomeFrequency: "monthly", balance: 500000, payday: addDays(today(), 12) },
      today(),
      new Date(),
    ),
    today(),
  );
  await addEntry(id, { amount: 4500, category: "food", note: "ข้าว", spentOn: today() }, `e-${run}`, "form");
  await addIncome(id, { amount: 50000, note: "แม่โอน", receivedOn: today() }, `i-${run}`, "form");
  const { plan } = await addPlan(
    id,
    { kind: "bill", title: "ค่าหอ", amount: 300000, dueOn: today(), category: null, status: "reserved", basis: null },
    `p-${run}`,
  );
  await actOnPlan(id, plan.id, "pay", null, today());
  const cycle = (await db.from("cycles").select("id").eq("user_id", id).single()).data!;
  expect((await db.from("balance_checks").insert({ user_id: id, cycle_id: cycle.id, balance: 100000, as_of: new Date().toISOString() })).error).toBeNull();
  await remember(id, [{ role: "user", body: "ข้าว 45" }]);
  await saveReminderSettings(id, { enabled: true, time: "12:30", pausedUntil: null });
  await saveNotificationPreferences(id, { daily: true, monthly: false, budget: false, time: "20:00" });
  await claimDailyPoints(id, `d-${run}`);
  const reward = await db.from("rewards").insert({ name: "ของทดสอบลบบัญชี", cost: 1, stock: 5 }).select("id").single();
  expect(reward.error).toBeNull();
  rewards.push(reward.data!.id);
  await redeemReward(id, reward.data!.id, `r-${run}`);
  expect((await db.rpc("consume_ai_quota", { p_user: id, p_global_limit: 100_000, p_user_limit: 100 })).data).toBe(true);
  return id;
}

async function rowsOf(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of USER_TABLES) {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
    expect(error).toBeNull();
    if (count) counts[table] = count;
  }
  const users = await db.from("users").select("id", { count: "exact", head: true }).eq("id", userId);
  if (users.count) counts.users = users.count;
  const quota = await db.from("ai_rate_windows").select("scope", { count: "exact", head: true }).eq("scope", `user:${userId}`);
  if (quota.count) counts.ai_rate_windows = quota.count;
  return counts;
}

describe("DELETE /api/me", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("users").delete().in("line_user_id", [lineA, lineB]);
    if (rewards.length) await db.from("rewards").delete().in("id", rewards.splice(0));
  });

  it("removes every row of the account, including a paid bill, its history and points", async () => {
    const id = await fullAccount(lineA);
    const before = await rowsOf(id);
    for (const table of ["users", "cycles", "entries", "incomes", "plans", "history", "balance_checks", "chat_messages",
      "reminder_settings", "points_wallets", "points_ledger", "reward_claims", "notification_preferences", "ai_rate_windows"]) {
      expect(before[table], table).toBeGreaterThan(0);
    }

    const res = await call(lineA);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(await rowsOf(id)).toEqual({});
  });

  it("leaves other accounts and shared data alone", async () => {
    await fullAccount(lineA);
    const other = await userIdForLine(lineB);
    await claimDailyPoints(other, `d-other-${run}`);
    const otherBefore = await rowsOf(other);

    expect((await call(lineA)).status).toBe(200);
    expect(await rowsOf(other)).toEqual(otherBefore);
    expect((await db.from("rewards").select("stock").eq("id", rewards[0]).single()).data).toEqual({ stock: 4 });
    expect((await db.from("price_hints").select("id", { count: "exact", head: true })).count).toBeGreaterThan(0);
  });

  it("deleting twice is still 200 and leaves no account behind", async () => {
    await fullAccount(lineA);
    expect((await call(lineA)).status).toBe(200);
    expect((await call(lineA)).status).toBe(200);
    expect((await db.from("users").select("id").eq("line_user_id", lineA)).data).toEqual([]);
  });

  it("401 without a valid token deletes nothing", async () => {
    const id = await fullAccount(lineA);
    const before = await rowsOf(id);
    for (const token of [undefined, "bad"]) {
      const res = await call(token);
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("unauthorized");
    }
    expect(await rowsOf(id)).toEqual(before);
  });

  it("the database function is service-only", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const id = await fullAccount(lineA);
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.rpc("delete_my_account", { p_user: id })).error).not.toBeNull();
    expect((await rowsOf(id)).users).toBe(1);
  });
});
