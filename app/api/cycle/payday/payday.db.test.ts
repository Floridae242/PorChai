import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { PUT as setPayday } from "./route";
import { POST as createCycle } from "../route";
import { POST as checkBalance } from "../balance/route";
import { POST as simulate } from "../../simulate/route";
import { GET as getSummary } from "../../summary/route";
import { POST as addEntry } from "../../entries/route";
import { POST as addPlan } from "../../plans/route";

// Card 23: money coming late, a new expense or a corrected balance → see before / after, confirm or cancel.
// A confirm built on numbers that changed since is refused (basis), so an old plan is recalculated first.

vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const today = () => thaiDate(new Date());

function req(path: string, method: string, body?: unknown, key?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${lineA}` };
  if (key) headers["Idempotency-Key"] = key;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Central example after postponing the activity: 1,000 · 10 days · essentials 70 · equipment 250 held → 50 spare
async function central(over: Record<string, unknown> = {}) {
  const res = await createCycle(
    req("/api/cycle", "POST", {
      incomeSource: "family",
      incomeFrequency: "monthly",
      payday: addDays(today(), 10),
      balance: 100000,
      essentials: { food: 5000, transport: 2000 },
      flexibleItems: [{ title: "ค่าอุปกรณ์", amount: 25000 }],
      ...over,
    }),
  );
  expect(res.status).toBe(201);
}

const tryIt = async (body: unknown) => (await simulate(req("/api/simulate", "POST", body))).json();
const summary = async () => (await getSummary(req("/api/summary", "GET"))).json();
const put = (body: unknown) => setPayday(req("/api/cycle/payday", "PUT", body));
const late = (days: number) => addDays(today(), 10 + days);

async function userId() {
  const { data } = await db.from("users").select("id").eq("line_user_id", lineA).single();
  return data!.id as string;
}

describe("card 23: PUT /api/cycle/payday (+ basis on every confirm)", () => {
  beforeEach(() => vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel"));
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  it("401 without a token", async () => {
    const res = await setPayday(new Request("http://localhost/api/cycle/payday", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("23: payday 2 days late — 50 spare becomes 90 short; the confirm gives exactly the preview, no income guessed", async () => {
    await central();
    const preview = await tryIt({ payday: late(2) });
    expect(preview.before).toMatchObject({ spare: 5000, daysLeft: 10 });
    expect(preview.after).toMatchObject({ spare: -9000, daysLeft: 12 });
    expect(preview.verdict).toBe("essentials_short");

    const res = await put({ payday: late(2), basis: preview.basis });
    expect(res.status).toBe(200);
    const { summary: s } = await res.json();
    expect(s).toMatchObject({ payday: late(2), balance: 100000, reserved: 25000 });
    expect(s.budget).toEqual(preview.after);
  });

  it("23: cancelling (never confirming) keeps the old plan", async () => {
    await central();
    await tryIt({ payday: late(2) });
    expect(await summary()).toMatchObject({ payday: late(0), budget: { spare: 5000 } });
  });

  it("23: an old plan is refused after the numbers changed (a spend was logged meanwhile) — recalculate first", async () => {
    await central();
    const old = await tryIt({ payday: late(2) });
    await addEntry(req("/api/entries", "POST", { amount: 4500, category: "food" }, crypto.randomUUID()));

    const stale = await put({ payday: late(2), basis: old.basis });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("stale");
    expect((await summary()).payday).toBe(late(0));

    const fresh = await tryIt({ payday: late(2) });
    expect(fresh.basis).not.toBe(old.basis);
    expect((await put({ payday: late(2), basis: fresh.basis })).status).toBe(200);
  });

  it("confirming twice (double tap) moves it once", async () => {
    await central();
    const { basis } = await tryIt({ payday: late(2) });
    const [a, b] = await Promise.all([put({ payday: late(2), basis }), put({ payday: late(2), basis })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await summary()).payday).toBe(late(2));
  });

  it("23: moving payday never touches what was really spent — entries and their history stay as they were", async () => {
    await central();
    await addEntry(req("/api/entries", "POST", { amount: 4500, category: "food" }, crypto.randomUUID()));
    const id = await userId();
    const before = await Promise.all([
      db.from("entries").select("*").eq("user_id", id),
      db.from("history").select("id").eq("user_id", id).eq("subject", "entry"),
    ]);
    const { basis } = await tryIt({ payday: late(2) });
    await put({ payday: late(2), basis });
    const after = await Promise.all([
      db.from("entries").select("*").eq("user_id", id),
      db.from("history").select("id").eq("user_id", id).eq("subject", "entry"),
    ]);
    expect(after.map((r) => r.data)).toEqual(before.map((r) => r.data));
  });

  it("an item due between the old and the new payday now belongs to this cycle — before and after the confirm", async () => {
    await central({ flexibleItems: [{ title: "ทริป", amount: 30000, dueOn: late(1) }] });
    expect((await summary()).reserved).toBe(0);
    const preview = await tryIt({ payday: late(2) });
    expect(preview.after).toMatchObject({ usable: 70000 }); // 1,000 − 300 now held
    const { summary: s } = await (await put({ payday: late(2), basis: preview.basis })).json();
    expect(s.reserved).toBe(30000);
    expect(s.budget).toEqual(preview.after);
  });

  it("422: payday must stay after today; basis is required", async () => {
    await central();
    const { basis } = await tryIt({ payday: late(2) });
    expect((await put({ payday: today(), basis })).status).toBe(422);
    expect((await put({ payday: late(2) })).status).toBe(422);
  });

  it("money coming early (still after today) works the same way", async () => {
    await central();
    const preview = await tryIt({ payday: addDays(today(), 5) });
    expect(preview.after).toMatchObject({ daysLeft: 5 });
    expect((await put({ payday: addDays(today(), 5), basis: preview.basis })).status).toBe(200);
  });

  it("23 extra expense: a plan confirmed on stale numbers is refused; a double tap still returns the first plan", async () => {
    await central();
    const old = await tryIt({ amount: 20000 });
    await addEntry(req("/api/entries", "POST", { amount: 4500, category: "food" }, crypto.randomUUID()));
    const stale = await addPlan(req("/api/plans", "POST", { title: "ค่ากิจกรรม", amount: 20000, basis: old.basis }, "k1"));
    expect(stale.status).toBe(409);

    const fresh = await tryIt({ amount: 20000 });
    const first = await addPlan(req("/api/plans", "POST", { title: "ค่ากิจกรรม", amount: 20000, basis: fresh.basis }, "k2"));
    expect(first.status).toBe(201);
    const again = await addPlan(req("/api/plans", "POST", { title: "ค่ากิจกรรม", amount: 20000, basis: fresh.basis }, "k2"));
    expect(again.status).toBe(200);
    expect((await summary()).reserved).toBe(45000);
  });

  it("23 corrected balance: try it first, a stale confirm is refused, a fresh one is saved", async () => {
    await central();
    const preview = await tryIt({ balance: 90000 });
    expect(preview.after).toMatchObject({ usable: 65000 });
    await addEntry(req("/api/entries", "POST", { amount: 100, category: "food" }, crypto.randomUUID()));
    expect((await checkBalance(req("/api/cycle/balance", "POST", { balance: 90000, basis: preview.basis }))).status).toBe(409);

    const fresh = await tryIt({ balance: 90000 });
    const ok = await checkBalance(req("/api/cycle/balance", "POST", { balance: 90000, basis: fresh.basis }));
    expect(ok.status).toBe(201);
    expect((await ok.json()).summary.balance).toBe(90000);
  });

  it("summary carries the same basis as a try made on the same numbers", async () => {
    await central();
    expect((await summary()).basis).toBe((await tryIt({ payday: late(2) })).basis);
  });

  it("409 no_cycle before setup", async () => {
    expect((await put({ payday: late(2), basis: "x" })).status).toBe(409);
  });
});
