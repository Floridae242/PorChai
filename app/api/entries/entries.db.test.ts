import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { addDays, thaiDate } from "@/lib/calc/time";
import type { VerifyResult } from "@/lib/line/id-token";
import { GET as listEntries, POST as addEntry } from "./route";
import { DELETE as cancelEntry, PATCH as editEntry } from "./[id]/route";
import { GET as getSummary } from "../summary/route";
import { POST as checkBalance } from "../cycle/balance/route";

// Card 11 evidence: totals stay right after add / edit / cancel / ปรับยอด, and nobody touches another user's data.

// Fake verifier: the token string is the LINE user id
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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeUser(line: string): Promise<string> {
  const { data, error } = await db.from("users").insert({ line_user_id: line }).select("id").single();
  expect(error).toBeNull();
  return data!.id;
}

// Figma demo cycle: 2,400 · bill 600 unpaid · savings 240 · buffer 120 · food 50 + transport 20 · 12 days
async function figmaCycle(userId: string) {
  const { data: cycle, error } = await db
    .from("cycles")
    .insert({
      user_id: userId,
      start_balance: 240000,
      payday: addDays(today(), 12),
      savings_amount: 24000,
      savings_percent: 10,
      emergency_buffer: 12000,
      essential_food_daily: 5000,
      essential_transport_daily: 2000,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  const { data: bill, error: billError } = await db
    .from("plans")
    .insert({ user_id: userId, cycle_id: cycle!.id, kind: "bill", title: "ค่าหอ", amount: 60000 })
    .select("id")
    .single();
  expect(billError).toBeNull();
  return { cycleId: cycle!.id as string, billId: bill!.id as string };
}

async function post(token: string, body: unknown, key = `k-${crypto.randomUUID()}`) {
  return addEntry(req("/api/entries", token, { method: "POST", body, key }));
}

async function summary(token: string) {
  const res = await getSummary(req("/api/summary", token));
  expect(res.status).toBe(200);
  return res.json();
}

describe("card 11: entries API", () => {
  let userA: string;
  let userB: string;

  beforeEach(async () => {
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
    userA = await makeUser(lineA);
    userB = await makeUser(lineB);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("users").delete().in("line_user_id", [lineA, lineB]);
  });

  it("401 without a token", async () => {
    const res = await addEntry(new Request("http://localhost/api/entries", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("409 no_cycle before the user sets up a cycle", async () => {
    const res = await post(lineA, { amount: 4500, category: "food" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("no_cycle");
    expect((await getSummary(req("/api/summary", lineA))).status).toBe(409);
  });

  it("400 without an Idempotency-Key", async () => {
    await figmaCycle(userA);
    const res = await addEntry(req("/api/entries", lineA, { method: "POST", body: { amount: 4500, category: "food" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("missing_idempotency_key");
  });

  it("422 for a bad body, and nothing is saved", async () => {
    const { cycleId } = await figmaCycle(userA);
    const res = await post(lineA, { amount: 0, category: "food" });
    expect(res.status).toBe(422);
    const { count } = await db.from("entries").select("id", { count: "exact", head: true }).eq("cycle_id", cycleId);
    expect(count).toBe(0);
  });

  it("Figma W10: before anything, 120 a day, max purchase 600, money 2,400", async () => {
    await figmaCycle(userA);
    const s = await summary(lineA);
    expect(s).toMatchObject({ balance: 240000, reserved: 60000, savings: 24000, emergencyBuffer: 12000 });
    expect(s.budget).toMatchObject({ kind: "ok", dailyBudget: 12000, todayRemaining: 12000, maxPurchase: 60000 });
  });

  it("add: rice 45 → 75 left today, money 2,355", async () => {
    await figmaCycle(userA);
    const res = await post(lineA, { amount: 4500, category: "food", note: "ข้าว" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entry).toMatchObject({ amount: 4500, category: "food", note: "ข้าว", spentOn: today(), source: "form" });
    expect(body.summary).toMatchObject({ balance: 235500, spentToday: 4500 });
    expect(body.summary.budget).toMatchObject({ dailyBudget: 12000, todayRemaining: 7500 });
  });

  it("R01: the same Idempotency-Key saves once, even sent five times at once", async () => {
    const { cycleId } = await figmaCycle(userA);
    const key = `k-${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(lineA, { amount: 4500, category: "food" }, key)),
    );
    const ids = new Set(await Promise.all(results.map(async (r) => (await r.json()).entry.id)));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const { count } = await db.from("entries").select("id", { count: "exact", head: true }).eq("cycle_id", cycleId);
    expect(count).toBe(1);
    expect((await summary(lineA)).budget.todayRemaining).toBe(7500);
  });

  it("edit: rice 45 → 50 leaves 70 today", async () => {
    await figmaCycle(userA);
    const { entry } = await (await post(lineA, { amount: 4500, category: "food" })).json();
    const res = await editEntry(req(`/api/entries/${entry.id}`, lineA, { method: "PATCH", body: { amount: 5000 } }), ctx(entry.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.amount).toBe(5000);
    expect(body.summary.budget.todayRemaining).toBe(7000);
  });

  it("cancel: the money comes back, the row and its history stay, the list hides it", async () => {
    await figmaCycle(userA);
    const { entry } = await (await post(lineA, { amount: 4500, category: "food" })).json();
    const res = await cancelEntry(req(`/api/entries/${entry.id}`, lineA, { method: "DELETE" }), ctx(entry.id));
    expect(res.status).toBe(200);
    expect((await res.json()).summary).toMatchObject({ balance: 240000, spentToday: 0 });

    const { data: row } = await db.from("entries").select("cancelled_at").eq("id", entry.id).single();
    expect(row!.cancelled_at).not.toBeNull();
    const { data: hist } = await db.from("history").select("action").eq("subject_id", entry.id).order("id");
    expect(hist!.map((h) => h.action)).toEqual(["create", "cancel"]);

    const list = await (await listEntries(req("/api/entries", lineA))).json();
    expect(list.entries).toEqual([]);
  });

  it("cancelling twice is harmless; editing a cancelled entry is refused", async () => {
    await figmaCycle(userA);
    const { entry } = await (await post(lineA, { amount: 4500, category: "food" })).json();
    const del = () => cancelEntry(req(`/api/entries/${entry.id}`, lineA, { method: "DELETE" }), ctx(entry.id));
    expect((await del()).status).toBe(200);
    expect((await del()).status).toBe(200);
    expect((await summary(lineA)).balance).toBe(240000);

    const res = await editEntry(req(`/api/entries/${entry.id}`, lineA, { method: "PATCH", body: { amount: 1 } }), ctx(entry.id));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("entry_cancelled");
  });

  it("R02: user B can neither see, edit nor cancel A's entry (404), and A's entry is unchanged", async () => {
    await figmaCycle(userA);
    await figmaCycle(userB);
    const { entry } = await (await post(lineA, { amount: 4500, category: "food" })).json();

    const edit = await editEntry(req(`/api/entries/${entry.id}`, lineB, { method: "PATCH", body: { amount: 1 } }), ctx(entry.id));
    const del = await cancelEntry(req(`/api/entries/${entry.id}`, lineB, { method: "DELETE" }), ctx(entry.id));
    expect([edit.status, del.status]).toEqual([404, 404]);
    expect((await listEntries(req("/api/entries", lineB)).then((r) => r.json())).entries).toEqual([]);

    const { data: row } = await db.from("entries").select("amount, cancelled_at").eq("id", entry.id).single();
    expect(row).toEqual({ amount: 4500, cancelled_at: null });
  });

  it("404 for an id that is not a uuid", async () => {
    await figmaCycle(userA);
    const res = await cancelEntry(req("/api/entries/abc", lineA, { method: "DELETE" }), ctx("abc"));
    expect(res.status).toBe(404);
  });

  it("an entry created by paying a plan cannot be edited or cancelled here (card 57 owns it)", async () => {
    const { cycleId } = await figmaCycle(userA);
    const { data: e } = await db
      .from("entries")
      .insert({
        user_id: userA, cycle_id: cycleId, amount: 60000, category: "bills",
        spent_on: today(), source: "plan", idempotency_key: `plan-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();
    const edit = await editEntry(req(`/api/entries/${e!.id}`, lineA, { method: "PATCH", body: { amount: 1 } }), ctx(e!.id));
    const del = await cancelEntry(req(`/api/entries/${e!.id}`, lineA, { method: "DELETE" }), ctx(e!.id));
    expect([edit.status, del.status]).toEqual([409, 409]);
    expect((await edit.json()).error.code).toBe("plan_entry");
  });

  it("pending vs paid: a pending bill holds money back; paying it moves it to spent — daily budget unchanged", async () => {
    const { cycleId, billId } = await figmaCycle(userA);
    const pending = await summary(lineA);
    expect(pending).toMatchObject({ balance: 240000, reserved: 60000 });

    const { data: e } = await db
      .from("entries")
      .insert({
        user_id: userA, cycle_id: cycleId, amount: 60000, category: "bills",
        spent_on: today(), source: "plan", idempotency_key: `plan-${billId}`,
      })
      .select("id")
      .single();
    await db.from("plans").update({ status: "paid", entry_id: e!.id }).eq("id", billId);

    const paid = await summary(lineA);
    expect(paid).toMatchObject({ balance: 180000, reserved: 0, spentToday: 0 });
    expect(paid.budget).toEqual(pending.budget);
  });

  it("ปรับยอด: sets the real balance without creating any entry", async () => {
    const { cycleId } = await figmaCycle(userA);
    await post(lineA, { amount: 4500, category: "food" });
    const res = await checkBalance(req("/api/cycle/balance", lineA, { method: "POST", body: { balance: 200000 } }));
    expect(res.status).toBe(201);
    expect((await res.json()).summary.balance).toBe(200000);
    const { count } = await db.from("entries").select("id", { count: "exact", head: true }).eq("cycle_id", cycleId);
    expect(count).toBe(1);
  });

  it("ปรับยอด R01: cancelling an entry from before the check does not change the checked balance; later entries do", async () => {
    await figmaCycle(userA);
    const { entry } = await (await post(lineA, { amount: 4500, category: "food" })).json();
    await checkBalance(req("/api/cycle/balance", lineA, { method: "POST", body: { balance: 200000 } }));

    await cancelEntry(req(`/api/entries/${entry.id}`, lineA, { method: "DELETE" }), ctx(entry.id));
    expect((await summary(lineA)).balance).toBe(200000);

    const after = await (await post(lineA, { amount: 1000, category: "transport" })).json();
    expect(after.summary.balance).toBe(199000);
  });

  it("ปรับยอด: a time older than the last balance is refused", async () => {
    await figmaCycle(userA);
    const res = await checkBalance(
      req("/api/cycle/balance", lineA, { method: "POST", body: { balance: 100000, asOf: "2020-01-01T00:00:00Z" } }),
    );
    expect(res.status).toBe(422);
  });

  it("ปรับยอด on another user's data is impossible: it always lands on the caller's own cycle", async () => {
    const { cycleId: cycleA } = await figmaCycle(userA);
    await figmaCycle(userB);
    await checkBalance(req("/api/cycle/balance", lineB, { method: "POST", body: { balance: 1, cycleId: cycleA } }));
    const { count } = await db.from("balance_checks").select("id", { count: "exact", head: true }).eq("cycle_id", cycleA);
    expect(count).toBe(0);
    expect((await summary(lineA)).balance).toBe(240000);
  });

  it("card 14: a cycle without essentials shows 75 a day but no purchase limit (unknown, ask first)", async () => {
    const { data: cycle } = await db
      .from("cycles")
      .insert({ user_id: userA, start_balance: 100000, payday: addDays(today(), 10) })
      .select("id")
      .single();
    await db.from("plans").insert({ user_id: userA, cycle_id: cycle!.id, kind: "purchase", title: "อุปกรณ์", amount: 25000 });
    const s = await summary(lineA);
    expect(s.essentialPerDay).toBeNull();
    expect(s.budget).toMatchObject({ dailyBudget: 7500, spare: null, maxPurchase: null, essentialShortPerDay: null });
  });

  it("lists the caller's active entries, newest first", async () => {
    await figmaCycle(userA);
    await post(lineA, { amount: 4500, category: "food" });
    await post(lineA, { amount: 5500, category: "food" });
    const { entries } = await (await listEntries(req("/api/entries", lineA))).json();
    expect(entries.map((e: { amount: number }) => e.amount)).toEqual([5500, 4500]);
  });
});
