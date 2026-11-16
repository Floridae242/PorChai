import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { POST as createCycle } from "@/app/api/cycle/route";
import { POST as adjustBalance } from "@/app/api/cycle/balance/route";
import { GET as listIncomes, POST as addIncome } from "@/app/api/income/route";

// รายรับ: the app's "จด › รายรับ" (โฟรวิว's addIncome) and the chat's «รับ 500» share this. Money received
// raises the money on hand at once; never a future day; the same key twice is one income.

vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const db = getDb();
const lineA = `U_I_${Math.random().toString(36).slice(2, 10)}`;
const today = () => thaiDate(new Date());
const auth = { Authorization: `Bearer ${lineA}` };

async function figma() {
  const res = await createCycle(
    new Request("http://localhost/api/cycle", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        incomeSource: "family",
        incomeFrequency: "monthly",
        payday: addDays(today(), 12),
        balance: 240000,
        bills: [{ title: "ค่าหอ", amount: 60000 }],
        savingsPercent: 10,
        emergencyBuffer: 12000,
        essentials: { food: 5000, transport: 2000 },
      }),
    }),
  );
  expect(res.status).toBe(201);
}

const income = (body: unknown, key: string | null = "k1") =>
  addIncome(
    new Request("http://localhost/api/income", {
      method: "POST",
      headers: { ...auth, ...(key && { "Idempotency-Key": key }) },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel"));
afterEach(async () => {
  vi.unstubAllEnvs();
  await db.from("users").delete().in("line_user_id", [lineA, `${lineA}_B`]);
});

describe("POST /api/income", () => {
  it("รับ 500: money on hand 2,400 → 2,900, a day 120 → 161.50 (1,940 ÷ 12, R3-quarter)", async () => {
    await figma();
    const res = await income({ amount: 50000, note: "แม่โอนให้" });
    expect(res.status).toBe(201);
    const { summary } = await res.json();
    expect(summary.balance).toBe(290000);
    expect(summary.budget).toMatchObject({ kind: "ok", dailyBudget: 16150 });
  });

  it("the same key twice (retry, double tap) is one income", async () => {
    await figma();
    await income({ amount: 50000 }, "same");
    const res = await income({ amount: 50000 }, "same");
    expect(res.status).toBe(200);
    expect((await res.json()).summary.balance).toBe(290000);
  });

  it("no future day, no bad amount, a key is required", async () => {
    await figma();
    expect((await income({ amount: 50000, receivedOn: addDays(today(), 1) })).status).toBe(422);
    expect((await income({ amount: -5 })).status).toBe(422);
    expect((await income({ amount: 50000 }, null)).status).toBe(400);
  });

  it("before setup: the cycle comes first", async () => {
    expect((await income({ amount: 50000 })).status).toBe(409);
  });

  it("ปรับยอด after an income: the new balance already has it — never counted twice", async () => {
    await figma();
    await income({ amount: 50000 });
    const res = await adjustBalance(
      new Request("http://localhost/api/cycle/balance", { method: "POST", headers: auth, body: JSON.stringify({ balance: 290000 }) }),
    );
    expect((await res.json()).summary.balance).toBe(290000);
  });

  it("the anon key sees no incomes", async () => {
    await figma();
    await income({ amount: 50000 });
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.from("incomes").select("*")).data ?? []).toEqual([]);
  });
});

// 16 Nov: «ได้เงิน 50» in the chat was saved, but แผนเงิน › รายรับ stayed empty: there was no way to read incomes
describe("GET /api/income", () => {
  const list = (token = lineA) =>
    listIncomes(new Request("http://localhost/api/income", { headers: { Authorization: `Bearer ${token}` } }));

  it("this cycle's incomes, from the chat and the app, newest first", async () => {
    await figma();
    await income({ amount: 50000, note: "แม่โอนให้" }, "a");
    const owner = (await db.from("users").select("id").eq("line_user_id", lineA).single()).data!.id;
    const cycle = (await db.from("cycles").select("id").eq("user_id", owner).single()).data!.id;
    await db.from("incomes").insert({ user_id: owner, cycle_id: cycle, amount: 5000, note: null, received_on: today(), source: "chat", idempotency_key: "line:x" });
    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.incomes).toMatchObject([
      { amount: 5000, note: null, receivedOn: today(), source: "chat" },
      { amount: 50000, note: "แม่โอนให้", receivedOn: today(), source: "form" },
    ]);
    expect(Object.keys(body.incomes[0]).sort()).toEqual(["amount", "createdAt", "id", "note", "receivedOn", "source"]);
  });

  it("another account's incomes and cancelled ones are not listed", async () => {
    await figma();
    await income({ amount: 50000 }, "a");
    const owner = (await db.from("users").select("id").eq("line_user_id", lineA).single()).data!.id;
    await db.from("incomes").update({ cancelled_at: new Date().toISOString() }).eq("user_id", owner);
    expect((await (await list()).json()).incomes).toEqual([]);
    const other = await db.from("users").insert({ line_user_id: `${lineA}_B` }).select("id").single();
    expect(other.error).toBeNull();
    await income({ amount: 70000 }, "b");
    expect((await (await list(`${lineA}_B`)).json()).error.code).toBe("no_cycle");
    expect((await (await list()).json()).incomes).toMatchObject([{ amount: 70000 }]);
  });

  it("before setup: no_cycle, like the entries", async () => {
    expect((await list()).status).toBe(409);
  });

  it("no token: 401", async () => {
    const res = await listIncomes(new Request("http://localhost/api/income"));
    expect(res.status).toBe(401);
  });
});
