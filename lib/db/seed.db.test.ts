import { describe, expect, it } from "vitest";
import { simulatePurchase } from "@/lib/calc/budget";
import { getDb } from "@/lib/db/client";
import { loadSummary } from "@/lib/db/budget";

// Card 05: the local seed (supabase/seed.sql) covers try / choose a plan / pay for real,
// on the Figma demo cycle (2,400 · bill 600 · savings 240 · buffer 120 · 12 days).
// Seed loads on `supabase db reset`.

const db = getDb();

async function seededUser(line: string): Promise<string> {
  const { data } = await db.from("users").select("id").eq("line_user_id", line).maybeSingle();
  if (!data) throw new Error(`Seed user ${line} missing: run \`supabase db reset\` to load supabase/seed.sql`);
  return data.id;
}

async function count(table: string, userId: string): Promise<number> {
  const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  return count ?? 0;
}

describe("seed: try / choose a plan / pay for real", () => {
  it("try: after rice 45 the home screen shows 75 left; trying shoes 480 shows 80 a day and stores nothing", async () => {
    const userId = await seededUser("U_demo_try");
    const s = await loadSummary(userId);
    expect(s).toMatchObject({ balance: 235500, reserved: 60000, spentToday: 4500 });
    expect(s.budget).toMatchObject({ kind: "ok", dailyBudget: 12000, todayRemaining: 7500, maxPurchase: 60000 });

    const entriesBefore = await count("entries", userId);
    const plansBefore = await count("plans", userId);
    const input = {
      balance: s.balance,
      spentToday: s.spentToday,
      emergencyBuffer: s.emergencyBuffer,
      savings: s.savings,
      reserved: s.reserved,
      essentialPerDay: s.essentialPerDay,
      today: s.today,
      payday: s.payday,
    };
    expect(simulatePurchase(input, 48000)).toMatchObject({ kind: "ok", dailyBudget: 8000 });
    expect([await count("entries", userId), await count("plans", userId)]).toEqual([entriesBefore, plansBefore]);
  });

  it("choose a plan: shoes 480 held back — money still 2,400, 80 a day", async () => {
    const s = await loadSummary(await seededUser("U_demo_plan"));
    expect(s).toMatchObject({ balance: 240000, reserved: 108000 });
    expect(s.budget).toMatchObject({ kind: "ok", dailyBudget: 8000, todayRemaining: 8000 });
  });

  it("pay for real: shoes paid once — money 1,920, nothing held for them, still 80 a day", async () => {
    const userId = await seededUser("U_demo_paid");
    const s = await loadSummary(userId);
    expect(s).toMatchObject({ balance: 192000, reserved: 60000, spentToday: 0 });
    expect(s.budget).toMatchObject({ kind: "ok", dailyBudget: 8000, todayRemaining: 8000 });

    const { data: plan } = await db.from("plans").select("status, entry_id").eq("user_id", userId).eq("kind", "purchase").single();
    expect(plan!.status).toBe("paid");
    const { data: entry } = await db.from("entries").select("amount, source").eq("id", plan!.entry_id).single();
    expect(entry).toEqual({ amount: 48000, source: "plan" });
  });
});
