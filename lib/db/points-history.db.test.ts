import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { claimDailyPoints, pointsHistory, redeemReward } from "@/lib/db/rewards";

// Needs a local Supabase (npm run test:db). Not run when it was written (no Docker): run it before relying on it.
const db = getDb();
const users: string[] = [];
const rewards: string[] = [];
afterEach(async () => {
  if (users.length) await db.from("users").delete().in("id", users.splice(0));
  if (rewards.length) await db.from("rewards").delete().in("id", rewards.splice(0));
});

describe("real PostgreSQL points history", () => {
  it("lists my daily point and my redemption (with the reward name), newest first, and nobody else's", async () => {
    const u = (await db.from("users").insert({ line_user_id: `U_hist_${crypto.randomUUID()}` }).select("id").single()).data!.id as string;
    const other = (await db.from("users").insert({ line_user_id: `U_hist_${crypto.randomUUID()}` }).select("id").single()).data!.id as string;
    users.push(u, other);
    await db.from("points_wallets").insert({ user_id: u, balance: 20 });
    const r = (await db.from("rewards").insert({ name: "History reward", stock: 1, cost: 10 }).select("id").single()).data!.id as string;
    rewards.push(r);
    await claimDailyPoints(u, "h-daily");
    await claimDailyPoints(other, "h-other");
    await redeemReward(u, r, "h-redeem");
    const { items } = await pointsHistory(u);
    expect(items.map((i) => [i.kind, i.delta, i.rewardName])).toEqual([
      ["redemption", -10, "History reward"],
      ["daily", 1, null],
    ]);
    expect(JSON.stringify(items)).not.toMatch(/RW-/); // the reward code is never listed
  });
});
