import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { POST as ask } from "./route";
import { POST as createCycle } from "../cycle/route";
import { POST as addPlan } from "../plans/route";
import { GET as getSummary } from "../summary/route";

// Card 15: «พรุ่งนี้กินชาบู 300 บาทไหวไหม» → เงินพอ / เงินตึง / เงินไม่พอ / ข้อมูลไม่ครบ, with options
// (ลดงบ / เลื่อน / ขอใช้เงินเผื่อ). Numbers come from the calculator; the AI only reads and words, and is checked.

vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null) })); // AI off unless a test says otherwise
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

import { generate } from "@/lib/ai/gemini";

const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const today = () => thaiDate(new Date());

function req(path: string, method: string, body?: unknown, key?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${lineA}` };
  if (key) headers["Idempotency-Key"] = key;
  return new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function cycle(body: Record<string, unknown>) {
  const res = await createCycle(req("/api/cycle", "POST", { incomeSource: "family", incomeFrequency: "monthly", ...body }));
  expect(res.status).toBe(201);
}

// Figma: 2,400 · bill 600 · savings 240 · buffer 120 · essentials 70 · 12 days → 120 a day, up to 600 an item
const figma = () =>
  cycle({
    payday: addDays(today(), 12),
    balance: 240000,
    bills: [{ title: "ค่าหอ", amount: 60000 }],
    savingsPercent: 10,
    emergencyBuffer: 12000,
    essentials: { food: 5000, transport: 2000 },
  });

const advise = async (question: string) => {
  const res = await ask(req("/api/advice", "POST", { question }));
  expect(res.status).toBe(200);
  return res.json();
};

// The AI's two calls: reading the question, then wording the answer
function aiSays(reading: object | null, wording: string | null) {
  vi.mocked(generate).mockResolvedValueOnce(reading ? JSON.stringify(reading) : null).mockResolvedValueOnce(wording);
}

describe("card 15: POST /api/advice", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
    vi.mocked(generate).mockReset();
    vi.mocked(generate).mockResolvedValue(null);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  it("401 without a token", async () => {
    const res = await ask(new Request("http://localhost/api/advice", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("เงินพอ: «พรุ่งนี้กินชาบู 300 บาทไหวไหม» → 120 a day becomes 95, essentials still covered", async () => {
    await figma();
    const a = await advise("พรุ่งนี้กินชาบู 300 บาทไหวไหม");
    expect(a).toMatchObject({ verdict: "enough", item: "ชาบู", amount: 30000, dueOn: addDays(today(), 1), options: [], byAI: false });
    expect(a.after).toMatchObject({ dailyBudget: 9500 });
    expect(a.explanation).toContain("ไหว ✓ ชาบู 300 บาท (พรุ่งนี้)");
    expect(a.explanation).toContain("งบต่อวันจาก 120 เหลือ 95 บาท");
  });

  it("เงินตึง: headphones 700 → short 8.50 a day; options: spend at most 600, or use the 120 buffer if allowed (→ 71.50 a day, R3-quarter)", async () => {
    await figma();
    const a = await advise("ซื้อหูฟัง 700 ได้มั้ย");
    expect(a.verdict).toBe("tight");
    expect(a.options).toEqual([
      { kind: "spend_less", maxAmount: 60000 },
      expect.objectContaining({ kind: "use_buffer", buffer: 12000, verdict: "enough", after: expect.objectContaining({ dailyBudget: 7150 }) }),
    ]);
    expect(a.explanation).toContain("ขาดวันละ 8.50"); // same format as the screens
    expect(a.explanation).toContain("ลดงบ: ไม่เกิน 600 บาท");
    expect(a.explanation).toContain("ถ้าอนุญาตใช้เงินเผื่อ 120 บาท");
  });

  it("เงินไม่พอ: 2,000 on 1,440 usable → says the shortfall, 560", async () => {
    await figma();
    const a = await advise("ซื้อโน้ตบุ๊ก 2000 ไหวไหม");
    expect(a.verdict).toBe("short");
    expect(a.after).toMatchObject({ kind: "shortfall", shortfall: 56000 });
    expect(a.explanation).toContain("ขาด 560 บาท");
    expect(a.options.map((o: { kind: string }) => o.kind)).toEqual(["spend_less"]); // the buffer alone does not fix it
  });

  it("ข้อมูลไม่ครบ: no price → asks; essentials unknown → asks; nothing calculated", async () => {
    await figma();
    expect(await advise("ชาบูไหวไหม")).toMatchObject({ verdict: "ask", needs: ["amount"], before: null });
    await db.from("users").delete().eq("line_user_id", lineA);
    await cycle({ payday: addDays(today(), 10), balance: 100000 });
    const a = await advise("ชาบู 300 ไหวไหม");
    expect(a).toMatchObject({ verdict: "ask", needs: ["essentials"], before: null, after: null });
    expect(a.explanation).toContain("ค่ากินค่ารถ");
  });

  it("เลื่อน: central example with equipment 250 + activity 200 held → postponing them is offered", async () => {
    await cycle({ payday: addDays(today(), 10), balance: 100000, essentials: { food: 5000, transport: 2000 } });
    for (const [title, amount] of [["ค่าอุปกรณ์", 25000], ["ค่ากิจกรรม", 20000]] as const) {
      await addPlan(req("/api/plans", "POST", { title, amount }, crypto.randomUUID()));
    }
    const a = await advise("ซื้อเสื้อ 100 ไหวไหม");
    expect(a.verdict).toBe("tight");
    const postpone = a.options.find((o: { kind: string }) => o.kind === "postpone");
    expect(postpone.plans.map((p: { title: string }) => p.title)).toEqual(["ค่าอุปกรณ์", "ค่ากิจกรรม"]);
    expect(postpone.verdict).toBe("enough");
    expect(a.explanation).not.toMatch(/ลดค่ากิน|ลดค่ารถ|ลดค่าเดินทาง/);
  });

  it("asking changes nothing — same summary, no plan, no spend", async () => {
    await figma();
    const before = await (await getSummary(req("/api/summary", "GET"))).json();
    await advise("ซื้อหูฟัง 700 ได้มั้ย");
    expect(await (await getSummary(req("/api/summary", "GET"))).json()).toEqual(before);
    const { count } = await db.from("plans").select("id", { count: "exact", head: true }).eq("title", "หูฟัง");
    expect(count).toBe(0);
  });

  it("AI on: its wording is used when every number in it came from the calculator", async () => {
    await figma();
    aiSays({ item: "ชาบู", amount_baht: 300 }, "ไหวเลย ชาบู 300 บาทพรุ่งนี้ งบต่อวันจาก 120 เหลือ 95 ค่ากินค่ารถ 70 ยังพอ");
    const a = await advise("พรุ่งนี้กินชาบู 300 บาทไหวไหม");
    expect(a).toMatchObject({ byAI: true, verdict: "enough" });
    expect(a.explanation).toContain("ไหวเลย");
  });

  it("AI invents a number (96) → the template is used instead", async () => {
    await figma();
    aiSays({ item: "ชาบู", amount_baht: 300 }, "ไหว เหลือวันละ 96 บาท");
    const a = await advise("พรุ่งนี้กินชาบู 300 บาทไหวไหม");
    expect(a.byAI).toBe(false);
    expect(a.explanation).toContain("เหลือ 95 บาท");
  });

  it("AI suggests cutting food, or leaves out the shortfall → the template", async () => {
    await figma();
    aiSays({ item: "หูฟัง", amount_baht: 700 }, "ตึงนิดหน่อย ลองลดค่ากินวันละ 9 ดู");
    expect((await advise("ซื้อหูฟัง 700 ได้มั้ย")).byAI).toBe(false);
    aiSays({ item: "โน้ตบุ๊ก", amount_baht: 2000 }, "ไม่พอนะ ลองเก็บเงินก่อน");
    const short = await advise("ซื้อโน้ตบุ๊ก 2000 ไหวไหม");
    expect(short.byAI).toBe(false);
    expect(short.explanation).toContain("ขาด 560 บาท");
  });

  it("AI reads a price that is not the one written → asks instead of using it", async () => {
    await figma();
    aiSays({ item: "ชาบู", amount_baht: 500 }, null);
    expect(await advise("พรุ่งนี้กินชาบู 300 บาทไหวไหม")).toMatchObject({ verdict: "ask", needs: ["amount"] });
  });

  it("the AI is sent the question and numbers only — no LINE id or user id", async () => {
    await figma();
    await advise("ซื้อหูฟัง 700 ได้มั้ย");
    const { data: u } = await db.from("users").select("id").eq("line_user_id", lineA).single();
    const sent = JSON.stringify(vi.mocked(generate).mock.calls);
    expect(sent).toContain("หูฟัง");
    expect(sent).not.toContain(lineA);
    expect(sent).not.toContain(u!.id);
  });

  it("422 for an empty question; 409 no_cycle before setup", async () => {
    expect((await ask(req("/api/advice", "POST", { question: " " }))).status).toBe(422);
    expect((await ask(req("/api/advice", "POST", { question: "ชาบู 300 ไหวไหม" }))).status).toBe(409);
  });
});
