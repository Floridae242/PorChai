import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "./client";
import { loadBudget, loadSummary } from "./budget";

const db = getDb();
const users: string[] = [];
async function user() {
  const { data, error } = await db.from("users").insert({ line_user_id: `scale-${crypto.randomUUID()}` }).select("id").single();
  expect(error).toBeNull(); users.push(data!.id); return data!.id as string;
}
afterEach(async () => {
  if (users.length) {
    await db.from("ai_rate_windows").delete().in("scope", users.map((u) => `user:${u}`));
    await db.from("users").delete().in("id", users.splice(0));
  }
});

describe("scalable budget snapshot", () => {
  it("counts all 1,505 entries beyond the REST cap, with cancellation/anchor/plan rules", async () => {
    const id = await user();
    const anchor = "2026-11-14T01:00:00Z";
    const { data: c, error } = await db.from("cycles").insert({ user_id: id, start_balance: 1_000_000, start_balance_at: anchor, payday: "2026-11-24", emergency_buffer: 0 }).select("id").single();
    expect(error).toBeNull();
    const rows = Array.from({ length: 1505 }, (_, i) => ({ user_id: id, cycle_id: c!.id, amount: 100, category: "food", spent_on: "2026-11-14", created_at: "2026-11-14T02:00:00Z", source: "form", idempotency_key: `k${i}` }));
    expect((await db.from("entries").insert(rows)).error).toBeNull();
    expect((await db.from("entries").insert([
      { ...rows[0], idempotency_key: "cancelled", cancelled_at: "2026-11-14T03:00:00Z" },
      { ...rows[0], idempotency_key: "before-anchor", created_at: "2026-11-14T00:00:00Z" },
      { ...rows[0], idempotency_key: "backdated", spent_on: "2026-11-13" },
      { ...rows[0], idempotency_key: "plan-paid", source: "plan" },
    ])).error).toBeNull();
    expect((await db.from("incomes").insert({ user_id: id, cycle_id: c!.id, amount: 500, note: "income", received_on: "2026-11-14", created_at: "2026-11-14T02:00:00Z", source: "form", idempotency_key: "in" })).error).toBeNull();
    const s = await loadSummary(id, new Date("2026-11-14T05:00:00Z"));
    expect(s).toMatchObject({ balance: 849900, spentToday: 150600 });
    expect(s.budget).toMatchObject({ kind: "ok", dailyBudget: 100050, todayRemaining: -50550 });
    const other = await user();
    expect((await db.rpc("budget_snapshot", { p_user: other, p_today: "2026-11-14" })).data).toBeNull();
  });

  it("cycle-start wins an equal timestamp; later anchors are stable", async () => {
    const id = await user();
    const { data: c } = await db.from("cycles").insert({ user_id: id, start_balance: 10000, start_balance_at: "2026-11-14T01:00:00Z", payday: "2026-11-24", emergency_buffer: 0 }).select("id").single();
    expect((await db.from("balance_checks").insert({ user_id: id, cycle_id: c!.id, balance: 50000, as_of: "2026-11-14T01:00:00Z" })).error).toBeNull();
    expect((await loadBudget(id)).anchor.amount).toBe(10000);
    expect((await db.from("balance_checks").insert({ user_id: id, cycle_id: c!.id, balance: 20000, as_of: "2026-11-14T02:00:00Z" })).error).toBeNull();
    expect((await loadBudget(id)).anchor.amount).toBe(20000);
  });

  it("refuses unsafe monetary totals instead of returning rounded JavaScript money", async () => {
    const id = await user();
    expect((await db.from("cycles").insert({ user_id: id, start_balance: 9_007_199_254_740_992, payday: "2026-11-24", emergency_buffer: 0 })).error).toBeNull();
    await expect(loadBudget(id)).rejects.toMatchObject({ status: 503, code: "amount_out_of_range" });
  });

  it("Thai midnight changes today's spending and days left, without changing the balance", async () => {
    const id = await user();
    const { data: cycle, error } = await db.from("cycles").insert({ user_id: id, start_balance: 100000, start_balance_at: "2026-11-14T01:00:00Z", payday: "2026-11-24", emergency_buffer: 0 }).select("id").single();
    expect(error).toBeNull();
    expect((await db.from("entries").insert({ user_id: id, cycle_id: cycle!.id, amount: 4500, category: "food", note: "ข้าว", spent_on: "2026-11-14", created_at: "2026-11-14T16:59:00Z", source: "form", idempotency_key: "midnight" })).error).toBeNull();
    const before = await loadSummary(id, new Date("2026-11-14T16:59:59Z"));
    const after = await loadSummary(id, new Date("2026-11-14T17:00:00Z"));
    expect(before).toMatchObject({ today: "2026-11-14", balance: 95500, spentToday: 4500, budget: { kind: "ok", daysLeft: 10, dailyBudget: 10000, todayRemaining: 5500 } });
    expect(after).toMatchObject({ today: "2026-11-15", balance: 95500, spentToday: 0, budget: { kind: "ok", daysLeft: 9, dailyBudget: 10600, todayRemaining: 10600 } });
    expect(after.basis).not.toBe(before.basis);
  });

  it("the snapshot and quota RPCs are unavailable to anonymous callers", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const id = await user();
    expect((await anon.rpc("budget_snapshot", { p_user: id, p_today: "2026-11-14" })).error).not.toBeNull();
    expect((await anon.rpc("consume_ai_quota", { p_user: id, p_global_limit: 100, p_user_limit: 10 })).error).not.toBeNull();
  });
});

describe("distributed AI admission", () => {
  it("25 concurrent requests from separate clients admit exactly the per-user limit", async () => {
    const id = await user();
    const results = await Promise.all(Array.from({ length: 25 }, () => db.rpc("consume_ai_quota", { p_user: id, p_global_limit: 100_000, p_user_limit: 5 })));
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(results.filter((r) => r.data === true)).toHaveLength(5);
    const { data } = await db.from("ai_rate_windows").select("used").eq("scope", `user:${id}`).single();
    expect(data!.used).toBe(5);
  });
  it("missing users and zero limits cannot consume quota", async () => {
    expect((await db.rpc("consume_ai_quota", { p_user: crypto.randomUUID(), p_global_limit: 100, p_user_limit: 5 })).data).toBe(false);
    const id = await user();
    expect((await db.rpc("consume_ai_quota", { p_user: id, p_global_limit: 0, p_user_limit: 5 })).data).toBe(false);
  });
});
