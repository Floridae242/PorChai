import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { POST as createCycle } from "./route";
import { GET as getSummary } from "../summary/route";

// POST /api/cycle: the W4–W9 setup creates the cycle and its bills / items in one transaction.

vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const lineB = `U_B_${run}`;
const today = () => thaiDate(new Date());

const post = (token: string, body: unknown) =>
  createCycle(
    new Request("http://localhost/api/cycle", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );

// Figma W4–W9: 2,400 · bill 600 · savings 10% · buffer 120 · food 50 + transport 20 · 12 days
const figma = (over: Record<string, unknown> = {}) => ({
  incomeSource: "family",
  incomeFrequency: "monthly",
  payday: addDays(today(), 12),
  balance: 240000,
  bills: [{ title: "ค่าหอ", amount: 60000 }],
  savingsPercent: 10,
  emergencyBuffer: 12000,
  essentials: { food: 5000, transport: 2000 },
  ...over,
});

async function userId(line: string): Promise<string> {
  const { data } = await db.from("users").select("id").eq("line_user_id", line).single();
  return data!.id;
}

async function cycles(line: string) {
  const { data } = await db
    .from("cycles")
    .select("id, status, payday, savings_amount, savings_percent, income_source, income_frequency")
    .eq("user_id", await userId(line))
    .order("created_at");
  return data!;
}

describe("POST /api/cycle", () => {
  beforeEach(() => vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel"));
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("users").delete().in("line_user_id", [lineA, lineB]);
  });

  it("401 without a token", async () => {
    const res = await createCycle(new Request("http://localhost/api/cycle", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("W9: the Figma setup gives 120 a day and a 600 purchase limit", async () => {
    const res = await post(lineA, figma());
    expect(res.status).toBe(201);
    const { summary } = await res.json();
    expect(summary).toMatchObject({ balance: 240000, reserved: 60000, savings: 24000, emergencyBuffer: 12000, essentialPerDay: 7000 });
    expect(summary.budget).toMatchObject({ kind: "ok", dailyBudget: 12000, maxPurchase: 60000, daysLeft: 12 });

    const [c] = await cycles(lineA);
    expect(c).toMatchObject({ status: "active", savings_amount: 24000, savings_percent: 10, income_source: "family", income_frequency: "monthly" });
  });

  it("W5: bills already paid or paid separately are stored but not held back", async () => {
    const res = await post(
      lineA,
      figma({
        bills: [
          { title: "ค่าหอ", amount: 60000, status: "separate" },
          { title: "ค่าน้ำ", amount: 10000, status: "paid" },
          { title: "ค่าเน็ต", amount: 20000 },
        ],
      }),
    );
    expect((await res.json()).summary.reserved).toBe(20000);
    const { data: plans } = await db.from("plans").select("status, entry_id").eq("user_id", await userId(lineA)).order("amount");
    expect(plans).toEqual([
      { status: "paid", entry_id: null },
      { status: "reserved", entry_id: null },
      { status: "separate", entry_id: null },
    ]);
  });

  it("W8: an item due after payday is not taken from this cycle; one due before is", async () => {
    const res = await post(
      lineA,
      figma({
        bills: [],
        flexibleItems: [
          { title: "ทริป", amount: 50000, dueOn: addDays(today(), 20) },
          { title: "ของขวัญ", amount: 30000, dueOn: addDays(today(), 3) },
        ],
      }),
    );
    expect((await res.json()).summary.reserved).toBe(30000);
  });

  it("card 14: essentials left out stay unknown — no purchase limit until asked", async () => {
    const res = await post(lineA, figma({ essentials: undefined }));
    const { summary } = await res.json();
    expect(summary.essentialPerDay).toBeNull();
    expect(summary.budget.maxPurchase).toBeNull();
  });

  it("W5: the balance time is kept as the anchor", async () => {
    const asOf = new Date(Date.now() - 3_600_000).toISOString();
    const { summary } = await (await post(lineA, figma({ balanceAsOf: asOf }))).json();
    expect(new Date(summary.balanceAsOf).getTime()).toBe(new Date(asOf).getTime());
  });

  it("422 for bad input, and nothing is created", async () => {
    const res = await post(lineA, figma({ payday: today() }));
    expect(res.status).toBe(422);
    const { count } = await db.from("cycles").select("id", { count: "exact", head: true }).eq("user_id", await userId(lineA));
    expect(count).toBe(0);
  });

  it("one transaction: a plan the DB rejects leaves no half-made cycle behind", async () => {
    const { data: u } = await db.from("users").insert({ line_user_id: lineA }).select("id").single();
    const { error } = await db.rpc("create_cycle", {
      p_user: u!.id,
      p_today: today(),
      p_cycle: { start_balance: 100000, payday: addDays(today(), 5) },
      // 'separate' is for bills only: the DB check fails after the cycle row was inserted
      p_plans: [{ kind: "purchase", title: "x", amount: 100, due_on: null, status: "separate" }],
    });
    expect(error?.code).toBe("23514");
    expect(await cycles(lineA)).toHaveLength(0);
  });

  it("409 cycle_exists while the current cycle has not reached payday; still one cycle", async () => {
    expect((await post(lineA, figma())).status).toBe(201);
    const again = await post(lineA, figma());
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("cycle_exists");
    expect(await cycles(lineA)).toHaveLength(1);
  });

  it("two setups sent at once create one cycle", async () => {
    const results = await Promise.all([post(lineA, figma()), post(lineA, figma())]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await cycles(lineA)).toHaveLength(1);
  });

  it("after payday: the old cycle closes and its unpaid plans move to the new cycle", async () => {
    await post(lineA, figma({ bills: [{ title: "ค่าหอ", amount: 60000 }, { title: "ค่าน้ำ", amount: 10000, status: "paid" }] }));
    const [old] = await cycles(lineA);
    await db.from("cycles").update({ payday: today() }).eq("id", old.id); // payday has come

    const res = await post(lineA, figma({ balance: 300000, bills: [{ title: "ค่าเน็ต", amount: 20000 }] }));
    expect(res.status).toBe(201);
    const [closed, active] = await cycles(lineA);
    expect([closed.status, active.status]).toEqual(["closed", "active"]);

    const { data: plans } = await db.from("plans").select("title, status, cycle_id").eq("user_id", await userId(lineA)).order("title");
    const byTitle = Object.fromEntries(plans!.map((p) => [p.title, p.cycle_id]));
    expect(byTitle["ค่าหอ"]).toBe(active.id); // unpaid: moved
    expect(byTitle["ค่าเน็ต"]).toBe(active.id); // new
    expect(byTitle["ค่าน้ำ"]).toBe(closed.id); // paid: stays with its cycle
    expect((await res.json()).summary.reserved).toBe(80000);
  });

  it("R02: user B's setup never touches user A", async () => {
    await post(lineA, figma());
    await post(lineB, figma({ balance: 100000, savingsPercent: undefined, emergencyBuffer: 0, bills: [] }));
    const a = await (await getSummary(new Request("http://localhost/api/summary", { headers: { Authorization: `Bearer ${lineA}` } }))).json();
    expect(a.balance).toBe(240000);
  });

  it("the anon key cannot call the create_cycle function directly, even with valid input", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: victim } = await db.from("users").insert({ line_user_id: lineB }).select("id").single();
    // Valid input: only the permission can stop it
    const { error } = await anon.rpc("create_cycle", {
      p_user: victim!.id,
      p_today: today(),
      p_cycle: { start_balance: 100000, payday: addDays(today(), 5) },
      p_plans: [],
    });
    // Stopped at the function itself (the table grants are a second, separate wall)
    expect(error?.message).toContain("permission denied for function create_cycle");
    expect(await cycles(lineB)).toHaveLength(0);
  });
});
