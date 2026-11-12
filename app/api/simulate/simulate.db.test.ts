import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { POST as simulate } from "./route";
import { GET as getSummary } from "../summary/route";
import { POST as createCycle } from "../cycle/route";
import { PUT as setEssentials } from "../cycle/essentials/route";
import { POST as addPlan } from "../plans/route";
import { POST as addEntry } from "../entries/route";

// Card 14: try before paying — before / after, asks when something is missing, and never saves (57 criterion 1).

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

async function cycle(token: string, body: Record<string, unknown>) {
  const res = await createCycle(
    req("/api/cycle", token, {
      method: "POST",
      body: { incomeSource: "family", incomeFrequency: "monthly", ...body },
    }),
  );
  expect(res.status).toBe(201);
}

// Figma W4–W9: 2,400 · bill 600 · savings 10% · buffer 120 · food 50 + transport 20 · 12 days
const figma = (token: string) =>
  cycle(token, {
    payday: addDays(today(), 12),
    balance: 240000,
    bills: [{ title: "ค่าหอ", amount: 60000 }],
    savingsPercent: 10,
    emergencyBuffer: 12000,
    essentials: { food: 5000, transport: 2000 },
  });

// Central example 1,000: 10 days · essentials 70 a day
const central = (token: string, over: Record<string, unknown> = {}) =>
  cycle(token, { payday: addDays(today(), 10), balance: 100000, essentials: { food: 5000, transport: 2000 }, ...over });

const tryIt = (token: string, body: unknown) => simulate(req("/api/simulate", token, { method: "POST", body }));

async function tried(token: string, body: unknown) {
  const res = await tryIt(token, body);
  expect(res.status).toBe(200);
  return res.json();
}

async function keep(token: string, body: Record<string, unknown>): Promise<string> {
  const res = await addPlan(req("/api/plans", token, { method: "POST", body, key: crypto.randomUUID() }));
  expect(res.status).toBe(201);
  return (await res.json()).plan.id;
}

async function summary(token: string) {
  return (await getSummary(req("/api/summary", token))).json();
}

async function userId(line: string): Promise<string> {
  const { data } = await db.from("users").select("id").eq("line_user_id", line).single();
  return data!.id;
}

// Every row a try could touch, to prove it touched none
async function snapshot(line: string) {
  const id = await userId(line);
  const [cycles, plans, entries, history, checks] = await Promise.all([
    db.from("cycles").select("*").eq("user_id", id).order("id"),
    db.from("plans").select("*").eq("user_id", id).order("id"),
    db.from("entries").select("*").eq("user_id", id).order("id"),
    db.from("history").select("id").eq("user_id", id).order("id"),
    db.from("balance_checks").select("*").eq("user_id", id).order("id"),
  ]);
  return [cycles.data, plans.data, entries.data, history.data, checks.data];
}

describe("card 14: POST /api/simulate", () => {
  beforeEach(() => vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel"));
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("users").delete().in("line_user_id", [lineA, lineB]);
  });

  it("401 without a token", async () => {
    const res = await simulate(new Request("http://localhost/api/simulate", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("still explains a shortfall after spending consumes the existing protected amounts", async () => {
    await figma(lineA);
    const spent = await addEntry(req("/api/entries", lineA, {
      method: "POST", key: crypto.randomUUID(),
      body: { amount: 230000, category: "other" },
    }));
    expect(spent.status).toBe(201);
    const res = await tryIt(lineA, { amount: 100 });
    expect(res.status).toBe(200);
    expect((await res.json()).verdict).toBe("shortfall");
    // Explicitly requesting an unaffordable buffer still receives validation.
    expect((await tryIt(lineA, { emergencyBuffer: 12000 })).status).toBe(422);
  });

  it("W12: shoes 480 → 120 a day becomes 80; bill, essentials, savings and buffer all checked", async () => {
    await figma(lineA);
    const r = await tried(lineA, { amount: 48000 });
    expect(r).toMatchObject({ verdict: "ok", needs: [], overLimitBy: 0, countsThisCycle: true });
    expect(r.before).toMatchObject({ dailyBudget: 12000, maxPurchase: 60000 });
    expect(r.after).toMatchObject({ dailyBudget: 8000 });
    expect(r.checks).toEqual({
      bills: 60000,
      billsCovered: true,
      essentialPerDay: 7000,
      essentialsCovered: true,
      savings: 24000,
      emergencyBuffer: 12000,
      otherPlans: 0,
    });
  });

  it("W14: headphones 700 → over the limit by 100, 61.50 a day, essentials short 8.50 a day (R3-quarter)", async () => {
    await figma(lineA);
    const r = await tried(lineA, { amount: 70000 });
    expect(r).toMatchObject({ verdict: "essentials_short", overLimitBy: 10000 });
    expect(r.after).toMatchObject({ dailyBudget: 6150, essentialShortPerDay: 850 });
    expect(r.checks).toMatchObject({ billsCovered: true, essentialsCovered: false });
  });

  it("57: trying changes nothing — no row anywhere, same summary", async () => {
    await central(lineA);
    const activity = await keep(lineA, { title: "ค่ากิจกรรม", amount: 20000 });
    const before = await snapshot(lineA);
    const sumBefore = await summary(lineA);

    await tried(lineA, { amount: 25000 });
    await tried(lineA, { postponePlanIds: [activity] });
    await tried(lineA, { amount: 90000, essentials: { food: 1, transport: 1 } });

    expect(await snapshot(lineA)).toEqual(before);
    expect(await summary(lineA)).toEqual(sumBefore);
  });

  it("14: every plan → 150 short; trying to postpone activity 200 → 50 spare, the plan itself untouched", async () => {
    await central(lineA);
    await keep(lineA, { title: "ค่าอุปกรณ์", amount: 25000 });
    const activity = await keep(lineA, { title: "ค่ากิจกรรม", amount: 20000 });

    expect((await summary(lineA)).budget.spare).toBe(-15000);

    const r = await tried(lineA, { postponePlanIds: [activity] });
    expect(r).toMatchObject({ verdict: "ok" });
    expect(r.before).toMatchObject({ spare: -15000 });
    expect(r.after).toMatchObject({ spare: 5000 });
    expect(r.checks).toMatchObject({ otherPlans: 25000 });
    expect((await summary(lineA)).reserved).toBe(45000);
  });

  it("14: only plans held this cycle can be tried as postponed; someone else's looks the same", async () => {
    await central(lineA);
    await central(lineB);
    const trip = await keep(lineA, { title: "ทริป", amount: 60000, status: "postponed" });
    const other = await keep(lineB, { title: "ของ B", amount: 1000 });

    for (const id of [trip, other]) {
      const res = await tryIt(lineA, { postponePlanIds: [id] });
      expect(res.status).toBe(422);
      expect((await res.json()).error.message).toContain("ไม่ได้กันเงินอยู่ในรอบนี้");
    }
  });

  it("14: income still to come is not money today — 1,200 on 1,000 is 200 short", async () => {
    await central(lineA);
    const r = await tried(lineA, { amount: 120000 });
    expect(r).toMatchObject({ verdict: "shortfall", overLimitBy: null });
    expect(r.after).toMatchObject({ kind: "shortfall", shortfall: 20000 });
    expect(r.checks).toMatchObject({ billsCovered: false, essentialsCovered: false });
  });

  it("14: the daily average is not the purchase limit — 100 a day, but 300 for one item", async () => {
    await central(lineA);
    const r = await tried(lineA, { amount: 30100 });
    expect(r.before).toMatchObject({ dailyBudget: 10000, maxPurchase: 30000 });
    expect(r.verdict).toBe("essentials_short");
  });

  it("W8: an item due after payday changes nothing this cycle", async () => {
    await central(lineA);
    const r = await tried(lineA, { amount: 50000, dueOn: addDays(today(), 20) });
    expect(r.countsThisCycle).toBe(false);
    expect(r.after).toEqual(r.before);
  });

  it("14: essentials unknown → ask first; answering in the try works without saving; PUT saves it", async () => {
    await central(lineA, { essentials: undefined });

    const ask = await tried(lineA, { amount: 25000 });
    expect(ask).toMatchObject({ verdict: "ask", needs: ["essentials"], before: null, after: null, checks: null });

    const answered = await tried(lineA, { amount: 25000, essentials: { food: 5000, transport: 2000 } });
    expect(answered).toMatchObject({ verdict: "ok", needs: [] });
    expect((await summary(lineA)).essentialPerDay).toBeNull();

    const put = await setEssentials(
      req("/api/cycle/essentials", lineA, { method: "PUT", body: { food: 5000, transport: 2000 } }),
    );
    expect(put.status).toBe(200);
    expect((await put.json()).summary).toMatchObject({ essentialPerDay: 7000, budget: { maxPurchase: 30000 } });
    expect((await tried(lineA, { amount: 25000 })).verdict).toBe("ok");
  });

  it("03: payday today → ask whether the money came", async () => {
    await central(lineA);
    await db.from("cycles").update({ payday: today() }).eq("user_id", await userId(lineA));
    const r = await tried(lineA, { amount: 100 });
    expect(r).toMatchObject({ verdict: "ask", needs: ["payday"] });
  });

  it("422 for an empty try or half the essentials; 409 no_cycle before setup", async () => {
    expect((await tryIt(lineA, { amount: 100 })).status).toBe(409);
    await central(lineA);
    expect((await tryIt(lineA, {})).status).toBe(422);
    const put = await setEssentials(req("/api/cycle/essentials", lineA, { method: "PUT", body: { food: 5000 } }));
    expect(put.status).toBe(422);
  });
});
