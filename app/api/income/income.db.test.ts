import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { POST as createCycle } from "@/app/api/cycle/route";
import { POST as adjustBalance } from "@/app/api/cycle/balance/route";
import { POST as addIncome } from "@/app/api/income/route";

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
  await db.from("users").delete().eq("line_user_id", lineA);
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
