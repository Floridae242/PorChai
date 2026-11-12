import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { GET as listPlans, POST as addPlan } from "./route";
import { POST as planAction } from "./[id]/[action]/route";
import { GET as getSummary } from "../summary/route";
import { POST as createCycle } from "../cycle/route";
import { DELETE as cancelEntry, PATCH as editEntry } from "../entries/[id]/route";

// Card 57: trying changes nothing, keeping a plan holds money back without spending it,
// paying spends it once and releases the hold, cancelling an unpaid plan only releases the hold.

vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const lineB = `U_B_${run}`;
const today = () => thaiDate(new Date());

function req(path: string, token: string, init: { method?: string; body?: unknown; key?: string } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (init.key) headers["Idempotency-Key"] = init.key;
  return new Request(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

// Central example 1,000: 10 days to payday, essentials 70 a day (food 50 + transport 20), nothing else
async function centralCycle(token: string, over: Record<string, unknown> = {}) {
  const res = await createCycle(
    req("/api/cycle", token, {
      method: "POST",
      body: {
        incomeSource: "family",
        incomeFrequency: "monthly",
        payday: addDays(today(), 10),
        balance: 100000,
        essentials: { food: 5000, transport: 2000 },
        ...over,
      },
    }),
  );
  expect(res.status).toBe(201);
}

const keep = (token: string, body: Record<string, unknown>, key = `k-${crypto.randomUUID()}`) =>
  addPlan(req("/api/plans", token, { method: "POST", body, key }));

async function keepId(token: string, body: Record<string, unknown>): Promise<string> {
  const res = await keep(token, body);
  expect(res.status).toBe(201);
  return (await res.json()).plan.id;
}

const act = (token: string, id: string, action: string, body?: unknown) =>
  planAction(req(`/api/plans/${id}/${action}`, token, { method: "POST", body }), {
    params: Promise.resolve({ id, action }),
  });

async function summary(token: string) {
  const res = await getSummary(req("/api/summary", token));
  expect(res.status).toBe(200);
  return res.json();
}

async function planEntries(token: string) {
  const { data: u } = await db.from("users").select("id").eq("line_user_id", token).single();
  const { data } = await db
    .from("entries")
    .select("id, amount, category, note, cancelled_at")
    .eq("user_id", u!.id)
    .eq("source", "plan")
    .order("created_at");
  return data!;
}

describe("card 57: plans API", () => {
  beforeEach(() => vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel"));
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("users").delete().in("line_user_id", [lineA, lineB]);
  });

  it("401 without a token", async () => {
    expect((await listPlans(new Request("http://localhost/api/plans"))).status).toBe(401);
  });

  it("57: keeping equipment 250 → real money still 1,000, 250 held; paying → 750, nothing held, budget unchanged", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });

    const kept = await summary(lineA);
    expect(kept).toMatchObject({ balance: 100000, reserved: 25000 });

    const paid = await act(lineA, id, "pay");
    expect(paid.status).toBe(200);
    const body = await paid.json();
    expect(body.plan).toMatchObject({ status: "paid", heldThisCycle: false });
    expect(body.summary).toMatchObject({ balance: 75000, reserved: 0, spentToday: 0 });
    expect(body.summary.budget).toEqual(kept.budget);
    expect(await planEntries(lineA)).toEqual([
      expect.objectContaining({ amount: 25000, category: "other", note: "ค่าอุปกรณ์", cancelled_at: null }),
    ]);
  });

  it("57: paying twice, or from two screens at once, spends the money once", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });

    const both = await Promise.all([act(lineA, id, "pay"), act(lineA, id, "pay")]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    const again = await act(lineA, id, "pay");
    expect((await again.json()).plan.entryId).toBe((await both[0].json()).plan.entryId);

    expect(await planEntries(lineA)).toHaveLength(1);
    expect((await summary(lineA)).balance).toBe(75000);
  });

  it("57: cancelling an unpaid plan only releases the hold — no fake income, no entry", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });

    const res = await act(lineA, id, "cancel");
    expect((await res.json()).summary).toMatchObject({ balance: 100000, reserved: 0 });
    expect((await act(lineA, id, "cancel")).status).toBe(200); // twice: same result
    expect(await planEntries(lineA)).toHaveLength(0);
    expect((await summary(lineA)).balance).toBe(100000);
  });

  it("57: pay and cancel at the same moment — exactly one wins", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });

    const [pay, cancel] = await Promise.all([act(lineA, id, "pay"), act(lineA, id, "cancel")]);
    expect([pay.status, cancel.status].sort()).toEqual([200, 409]);
    const s = await summary(lineA);
    if (pay.status === 200) expect(s).toMatchObject({ balance: 75000, reserved: 0 });
    else expect(s).toMatchObject({ balance: 100000, reserved: 0 });
    expect(await planEntries(lineA)).toHaveLength(pay.status === 200 ? 1 : 0);
  });

  it("a paid plan cannot be cancelled or postponed (409 plan_status)", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });
    await act(lineA, id, "pay");
    for (const action of ["cancel", "postpone", "keep"]) {
      const res = await act(lineA, id, action);
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("plan_status");
    }
  });

  it("57: the plan is still there when the screen is opened again", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000, category: "supplies" });
    const res = await listPlans(req("/api/plans", lineA));
    expect((await res.json()).plans).toEqual([
      expect.objectContaining({
        id,
        kind: "purchase",
        title: "ค่าอุปกรณ์",
        amount: 25000,
        category: "supplies",
        status: "reserved",
        heldThisCycle: true,
        entryId: null,
      }),
    ]);
  });

  it("card 14 numbers: all plans 150 short; postponing activity 200 leaves 50 spare; keeping it again → short again", async () => {
    await centralCycle(lineA);
    await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });
    const activity = await keepId(lineA, { title: "ค่ากิจกรรม", amount: 20000 });
    expect((await summary(lineA)).budget.spare).toBe(-15000);

    const postponed = await (await act(lineA, activity, "postpone")).json();
    expect(postponed.plan).toMatchObject({ status: "postponed", heldThisCycle: false });
    expect(postponed.summary.budget.spare).toBe(5000);

    const kept = await (await act(lineA, activity, "keep")).json();
    expect(kept.summary.budget.spare).toBe(-15000);
  });

  it("W15: a plan saved straight as เลื่อนไปรอบหน้า holds nothing now", async () => {
    await centralCycle(lineA);
    await keepId(lineA, { title: "ทริป", amount: 60000, status: "postponed" });
    expect((await summary(lineA)).reserved).toBe(0);
  });

  it("next cycle: a postponed plan moves over and is held there", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ทริป", amount: 60000, status: "postponed" });
    const { data: u } = await db.from("users").select("id").eq("line_user_id", lineA).single();
    await db.from("cycles").update({ payday: today() }).eq("user_id", u!.id); // payday has come

    await centralCycle(lineA, { balance: 300000 });
    const s = await summary(lineA);
    expect(s.reserved).toBe(60000);
    const { data: plan } = await db.from("plans").select("status, cycles(status)").eq("id", id).single();
    expect(plan).toMatchObject({ status: "reserved", cycles: { status: "active" } });
  });

  it("undo a payment: the entry is cancelled, the plan is held again, and it can be paid once more", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });
    await act(lineA, id, "pay");

    const undone = await (await act(lineA, id, "unpay")).json();
    expect(undone.plan).toMatchObject({ status: "reserved", entryId: null });
    expect(undone.summary).toMatchObject({ balance: 100000, reserved: 25000 });
    expect((await act(lineA, id, "unpay")).status).toBe(200); // twice: same result

    const repaid = await (await act(lineA, id, "pay")).json();
    expect(repaid.summary).toMatchObject({ balance: 75000, reserved: 0 });
    const entries = await planEntries(lineA);
    expect(entries.map((e) => e.cancelled_at === null)).toEqual([false, true]);
  });

  it("an unpaid plan cannot be un-paid", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ทริป", amount: 60000, status: "postponed" });
    expect((await act(lineA, id, "unpay")).status).toBe(409);
  });

  it("category: kept with the plan, overridden at pay, 'other' if never given; a bill pays into 'bills'", async () => {
    await centralCycle(lineA, { bills: [{ title: "ค่าเน็ต", amount: 20000 }] });
    const food = await keepId(lineA, { title: "ข้าวสาร", amount: 10000, category: "food" });
    const shoes = await keepId(lineA, { title: "รองเท้า", amount: 48000 });
    const plain = await keepId(lineA, { title: "ของขวัญ", amount: 5000 });
    const plans = (await (await listPlans(req("/api/plans", lineA))).json()).plans;
    const bill = plans.find((p: { kind: string }) => p.kind === "bill").id;

    await act(lineA, food, "pay");
    await act(lineA, shoes, "pay", { category: "supplies" });
    await act(lineA, plain, "pay");
    await act(lineA, bill, "pay", { category: "food" }); // ignored: a bill is a bill
    expect((await planEntries(lineA)).map((e) => e.category)).toEqual(["food", "supplies", "other", "bills"]);
  });

  it("L9: a paid purchase's entry can change category, but not amount, and is undone at the plan", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "รองเท้า", amount: 48000 });
    const entryId = (await (await act(lineA, id, "pay")).json()).plan.entryId;
    const ctx = { params: Promise.resolve({ id: entryId }) };
    const patch = (body: unknown) => editEntry(req(`/api/entries/${entryId}`, lineA, { method: "PATCH", body }), ctx);

    const moved = await patch({ category: "supplies" });
    expect(moved.status).toBe(200);
    expect((await moved.json()).entry.category).toBe("supplies");

    const amount = await patch({ amount: 1 });
    expect(amount.status).toBe(409);
    expect((await amount.json()).error.code).toBe("plan_entry");
    const del = await cancelEntry(req(`/api/entries/${entryId}`, lineA, { method: "DELETE" }), ctx);
    expect((await del.json()).error.message).toContain("ยกเลิกการจ่าย");
  });

  it("a paid bill's entry stays in 'bills'", async () => {
    await centralCycle(lineA, { bills: [{ title: "ค่าเน็ต", amount: 20000 }] });
    const bill = (await (await listPlans(req("/api/plans", lineA))).json()).plans[0].id;
    const entryId = (await (await act(lineA, bill, "pay")).json()).plan.entryId;
    const res = await editEntry(
      req(`/api/entries/${entryId}`, lineA, { method: "PATCH", body: { category: "food" } }),
      { params: Promise.resolve({ id: entryId }) },
    );
    expect(res.status).toBe(409);
  });

  it("a separately paid bill cannot be paid in the app", async () => {
    await centralCycle(lineA, { bills: [{ title: "ค่าหอ", amount: 60000, status: "separate" }] });
    const bill = (await (await listPlans(req("/api/plans", lineA))).json()).plans[0].id;
    const res = await act(lineA, bill, "pay");
    expect(res.status).toBe(409);
    expect(await planEntries(lineA)).toHaveLength(0);
  });

  it("double tap on เก็บไว้ในแผน: same Idempotency-Key → the same plan, held once", async () => {
    await centralCycle(lineA);
    const first = await keep(lineA, { title: "ค่าอุปกรณ์", amount: 25000 }, "tap-1");
    const second = await keep(lineA, { title: "ค่าอุปกรณ์", amount: 25000 }, "tap-1");
    expect([first.status, second.status]).toEqual([201, 200]);
    expect((await second.json()).plan.id).toBe((await first.json()).plan.id);
    expect((await summary(lineA)).reserved).toBe(25000);
  });

  it("400 without an Idempotency-Key", async () => {
    await centralCycle(lineA);
    const res = await addPlan(req("/api/plans", lineA, { method: "POST", body: { title: "x", amount: 100 } }));
    expect(res.status).toBe(400);
  });

  it("409 no_cycle before setup", async () => {
    const res = await keep(lineA, { title: "x", amount: 100 });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("no_cycle");
  });

  it("R02: user B cannot see or act on user A's plan (404), nor via a malformed id or unknown action", async () => {
    await centralCycle(lineA);
    await centralCycle(lineB);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });

    expect((await act(lineB, id, "pay")).status).toBe(404);
    expect((await act(lineB, id, "cancel")).status).toBe(404);
    expect((await (await listPlans(req("/api/plans", lineB))).json()).plans).toEqual([]);
    expect((await act(lineA, "abc", "pay")).status).toBe(404);
    expect((await act(lineA, id, "delete")).status).toBe(404);
    expect((await summary(lineA)).reserved).toBe(25000);
  });

  it("the anon key cannot call plan_action directly", async () => {
    await centralCycle(lineA);
    const id = await keepId(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });
    const { data: plan } = await db.from("plans").select("user_id, cycle_id").eq("id", id).single();
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error } = await anon.rpc("plan_action", {
      p_user: plan!.user_id,
      p_cycle: plan!.cycle_id,
      p_plan: id,
      p_action: "pay",
      p_category: null,
      p_today: today(),
    });
    expect(error?.message).toContain("permission denied for function plan_action");
    expect(await planEntries(lineA)).toHaveLength(0);
  });
});
