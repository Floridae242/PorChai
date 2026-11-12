import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { PUT as setBuffer } from "./route";
import { POST as createCycle } from "../route";
import { POST as simulate } from "../../simulate/route";
import { GET as getSummary } from "../../summary/route";

// Card 19: set aside or use part of the emergency buffer, see it first, confirm or cancel.
// Real money never moves; only what is free to plan changes.

vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const today = () => thaiDate(new Date());

function req(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { Authorization: `Bearer ${lineA}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Figma: 2,400 · bill 600 · savings 240 · buffer 120 · essentials 70 · 12 days
async function figma() {
  const res = await createCycle(
    req("/api/cycle", "POST", {
      incomeSource: "family",
      incomeFrequency: "monthly",
      payday: addDays(today(), 12),
      balance: 240000,
      bills: [{ title: "ค่าหอ", amount: 60000 }],
      savingsPercent: 10,
      emergencyBuffer: 12000,
      essentials: { food: 5000, transport: 2000 },
    }),
  );
  expect(res.status).toBe(201);
}

const put = (body: unknown) => setBuffer(req("/api/cycle/buffer", "PUT", body));
const tryIt = async (body: unknown) => (await simulate(req("/api/simulate", "POST", body))).json();
const summary = async () => (await getSummary(req("/api/summary", "GET"))).json();

describe("card 19: PUT /api/cycle/buffer", () => {
  beforeEach(() => vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel"));
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  it("401 without a token", async () => {
    const res = await setBuffer(new Request("http://localhost/api/cycle/buffer", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("19: confirming gives exactly what the summary screen showed; real money stays the same", async () => {
    await figma();
    const preview = await tryIt({ emergencyBuffer: 0 });
    expect(preview.before).toMatchObject({ dailyBudget: 12000 });
    expect(preview.after).toMatchObject({ dailyBudget: 13000 }); // (1,440 + 120) ÷ 12
    expect(preview.checks).toMatchObject({ emergencyBuffer: 0 });

    const res = await put({ amount: 0, previous: 12000 });
    expect(res.status).toBe(200);
    const { summary: after } = await res.json();
    expect(after).toMatchObject({ balance: 240000, emergencyBuffer: 0 });
    expect(after.budget).toEqual(preview.after);
  });

  it("19: cancelling (never confirming) leaves the old buffer", async () => {
    await figma();
    await tryIt({ emergencyBuffer: 0 });
    expect(await summary()).toMatchObject({ emergencyBuffer: 12000, balance: 240000 });
  });

  it("15 / 19: try headphones 700 using the buffer → essentials covered again", async () => {
    await figma();
    const without = await tryIt({ amount: 70000 });
    expect(without.verdict).toBe("essentials_short");
    const withBuffer = await tryIt({ amount: 70000, emergencyBuffer: 0 });
    expect(withBuffer.verdict).toBe("ok");
    expect(withBuffer.after).toMatchObject({ dailyBudget: 7100 }); // (1,440 + 120 − 700) ÷ 12
  });

  it("19: confirming twice (double tap) sets it once — nothing taken twice", async () => {
    await figma();
    const [a, b] = await Promise.all([put({ amount: 5000, previous: 12000 }), put({ amount: 5000, previous: 12000 })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await summary()).toMatchObject({ emergencyBuffer: 5000, balance: 240000 });
  });

  it("another screen changed it first → 409 stale, nothing overwritten", async () => {
    await figma();
    expect((await put({ amount: 5000, previous: 12000 })).status).toBe(200);
    const stale = await put({ amount: 0, previous: 12000 });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("stale");
    expect((await summary()).emergencyBuffer).toBe(5000);
  });

  it("two screens confirm different amounts at once → exactly one wins", async () => {
    await figma();
    const [a, b] = await Promise.all([put({ amount: 0, previous: 12000 }), put({ amount: 20000, previous: 12000 })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([0, 20000]).toContain((await summary()).emergencyBuffer);
  });

  it("19: setting more aside works too (กันเพิ่ม)", async () => {
    await figma();
    const { summary: s } = await (await put({ amount: 30000, previous: 12000 })).json();
    expect(s).toMatchObject({ balance: 240000, emergencyBuffer: 30000 });
  });

  it("19: cannot set aside more than the money on hand (savings + buffer ≤ balance)", async () => {
    await figma();
    const over = await put({ amount: 216001, previous: 12000 }); // 240 savings + 2,160.01 > 2,400
    expect(over.status).toBe(422);
    expect((await over.json()).error.message).toContain("เกินเงินที่มี");
    expect((await put({ amount: 216000, previous: 12000 })).status).toBe(200);

    const tried = await simulate(req("/api/simulate", "POST", { emergencyBuffer: 999999 }));
    expect(tried.status).toBe(422);
  });

  it("409 no_cycle before setup", async () => {
    expect((await put({ amount: 0, previous: 0 })).status).toBe(409);
  });
});
