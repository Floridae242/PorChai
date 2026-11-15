import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getDb } from "@/lib/db/client";
import { claimDailyPoints, listRewards, pointsState, redeemReward } from "@/lib/db/rewards";

const db = getDb();
const users: string[] = [];
const rewards: string[] = [];
async function user(balance = 0) {
  const r = await db.from("users").insert({ line_user_id: `U_reward_${crypto.randomUUID()}` }).select("id").single();
  expect(r.error).toBeNull();
  users.push(r.data!.id);
  if (balance) expect((await db.from("points_wallets").insert({ user_id: r.data!.id, balance })).error).toBeNull();
  return r.data!.id as string;
}
async function reward(stock = 1, cost = 200, active = true) {
  const r = await db.from("rewards").insert({ name: "Test reward", stock, cost, active }).select("id").single();
  expect(r.error).toBeNull();
  rewards.push(r.data!.id);
  return r.data!.id as string;
}
afterEach(async () => {
  if (users.length) expect((await db.from("users").delete().in("id", users.splice(0))).error).toBeNull();
  if (rewards.length) expect((await db.from("rewards").delete().in("id", rewards.splice(0))).error).toBeNull();
});

describe("real PostgreSQL points and reward transactions", () => {
  it("anonymous clients cannot read accounts, claim points, change stock or redeem on another account", async () => {
    const u = await user(500), r = await reward();
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const table of ["points_wallets", "points_ledger", "rewards", "reward_claims"]) {
      expect((await anon.from(table).select("*")).error).not.toBeNull();
    }
    expect((await anon.from("rewards").update({ stock: 100 }).eq("id", r)).error).not.toBeNull();
    for (const [rpc, args] of [
      ["points_state", { p_user: u }], ["claim_daily_points", { p_user: u, p_key: "attack" }],
      ["redeem_reward", { p_user: u, p_reward: r, p_key: "attack" }],
    ] as const) expect((await anon.rpc(rpc, args)).error).not.toBeNull();
    expect((await pointsState(u)).balance).toBe(500);
  });

  it("parallel different keys for one wallet cannot spend the same points twice", async () => {
    const u = await user(200), a = await reward(), b = await reward();
    const results = await Promise.allSettled([redeemReward(u, a, "a"), redeemReward(u, b, "b")]);
    expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(results.find((v) => v.status === "rejected")).toMatchObject({ reason: { code: "not_enough_points" } });
    expect((await pointsState(u)).balance).toBe(0);
    expect((await db.from("rewards").select("stock").in("id", [a, b])).data!.map((v) => v.stock).sort()).toEqual([0, 1]);
  });

  it("keys belong to accounts and replay returns the current balance after another redemption", async () => {
    const a = await user(500), b = await user(500), r = await reward(3);
    const first = await redeemReward(a, r, "same");
    await redeemReward(b, r, "same");
    await redeemReward(a, r, "second");
    expect(await redeemReward(a, r, "same")).toEqual({ balance: 100, code: first.code, created: false });
    expect((await pointsState(b)).balance).toBe(300);
    expect((await db.from("reward_claims").select("id").eq("reward_id", r)).data).toHaveLength(3);
  });

  it("balance overflow rolls back the daily ledger and balance together", async () => {
    const u = await user(Number.MAX_SAFE_INTEGER);
    await expect(claimDailyPoints(u, "overflow")).rejects.toBeDefined();
    expect(await pointsState(u)).toEqual({ balance: Number.MAX_SAFE_INTEGER, claimedToday: false });
    expect((await db.from("points_ledger").select("id").eq("user_id", u)).data).toEqual([]);
  });

  it("starts at zero without a financial cycle; simultaneous daily checks award exactly one point", async () => {
    const u = await user();
    expect(await pointsState(u)).toEqual({ balance: 0, claimedToday: false });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => claimDailyPoints(u, `daily-${i}`)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.every((r) => r.balance === 1 && r.claimedToday)).toBe(true);
    expect(await pointsState(u)).toEqual({ balance: 1, claimedToday: true });
    expect(await claimDailyPoints(u, "daily-0")).toMatchObject({ balance: 1, created: false });
    expect((await db.from("points_ledger").select("delta").eq("user_id", u)).data).toEqual([{ delta: 1 }]);
  });

  it("a previous day's claim permits a new day but reusing its key never awards again", async () => {
    const u = await user(1);
    expect((await db.from("points_ledger").insert({ user_id: u, kind: "daily", delta: 1, earned_on: "2000-01-01", idempotency_key: "old" })).error).toBeNull();
    expect(await pointsState(u)).toEqual({ balance: 1, claimedToday: false });
    await expect(claimDailyPoints(u, "old")).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    expect(await claimDailyPoints(u, "new")).toMatchObject({ balance: 2, claimedToday: true, created: true });
    const rows = await db.from("points_ledger").select("earned_on").eq("user_id", u).neq("earned_on", "2000-01-01");
    expect(rows.data).toHaveLength(1);
    expect(rows.data![0].earned_on).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  });

  it("P-24: two accounts race for the last item; only the winner loses points", async () => {
    const a = await user(500), b = await user(500), r = await reward();
    const results = await Promise.allSettled([redeemReward(a, r, "same-key"), redeemReward(b, r, "same-key")]);
    expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(results.find((v) => v.status === "rejected")).toMatchObject({ reason: { status: 409, code: "out_of_stock" } });
    expect([ (await pointsState(a)).balance, (await pointsState(b)).balance ].sort()).toEqual([300, 500]);
    expect((await db.from("rewards").select("stock").eq("id", r).single()).data!.stock).toBe(0);
    expect((await db.from("reward_claims").select("id").eq("reward_id", r)).data).toHaveLength(1);
    expect((await db.from("points_ledger").select("delta").in("user_id", [a, b])).data).toEqual([{ delta: -200 }]);
  });

  it("simultaneous retries return one code, one deduction and one reservation, even after stock reaches zero", async () => {
    const u = await user(500), r = await reward();
    const results = await Promise.all(Array.from({ length: 8 }, () => redeemReward(u, r, "retry")));
    expect(results.filter((v) => v.created)).toHaveLength(1);
    expect(new Set(results.map((v) => v.code)).size).toBe(1);
    expect(results.every((v) => v.balance === 300)).toBe(true);
    expect(results[0].code).toMatch(/^RW-[A-F0-9]{32}$/);
    expect(await redeemReward(u, r, "retry")).toMatchObject({ code: results[0].code, created: false });
  });

  it("the same key for a different reward conflicts without changing the other item", async () => {
    const u = await user(500), a = await reward(), b = await reward();
    await redeemReward(u, a, "shared");
    await expect(redeemReward(u, b, "shared")).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    expect((await db.from("rewards").select("stock").eq("id", b).single()).data!.stock).toBe(1);
    expect((await pointsState(u)).balance).toBe(300);
  });

  it("insufficient balance, inactive, missing and sold out rewards make no deductions", async () => {
    const u = await user(10), expensive = await reward(), inactive = await reward(1, 1, false), empty = await reward(0, 1);
    await expect(redeemReward(u, expensive, "x")).rejects.toMatchObject({ code: "not_enough_points" });
    await expect(redeemReward(u, inactive, "x")).rejects.toMatchObject({ status: 404 });
    await expect(redeemReward(u, crypto.randomUUID(), "x")).rejects.toMatchObject({ status: 404 });
    await expect(redeemReward(u, empty, "x")).rejects.toMatchObject({ code: "out_of_stock" });
    await expect(redeemReward(u, "invalid", "x")).rejects.toMatchObject({ status: 404 });
    expect((await pointsState(u)).balance).toBe(10);
    expect((await db.from("reward_claims").select("id").eq("user_id", u)).data).toEqual([]);
    const catalog = await listRewards();
    expect(catalog.some((v) => v.id === inactive)).toBe(false);
    expect(catalog.find((v) => v.id === expensive)).toEqual({ id: expensive, name: "Test reward", cost: 200, stock: 1 });
  });
});
