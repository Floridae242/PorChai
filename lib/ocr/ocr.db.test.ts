import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { generateFromImage } from "@/lib/ai/gemini";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import type { ReplyMessage } from "@/lib/line/reply";
import { POST as webhook } from "@/app/api/line/webhook/route";
import { POST as createCycle } from "@/app/api/cycle/route";

// OCR (layer 4): a slip photo in the chat → โฟรวิว's draft card → nothing is recorded until บันทึก
// (user's choice 13 Nov). Only LINE (reply, image download, ID token) and Gemini are faked.

const replies: ReplyMessage[][] = [];
vi.mock("@/lib/line/reply", async (orig) => ({
  ...(await orig<typeof import("@/lib/line/reply")>()),
  reply: vi.fn(async (_t: string, messages: ReplyMessage[]) => {
    replies.push(messages);
  }),
}));
vi.mock("@/lib/line/content", () => ({
  messageImage: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" })),
}));
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null), generateFromImage: vi.fn(async () => null) }));
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const secret = "test-secret";
const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_O_${run}`;
const lineB = `U_OB_${run}`;
const eventIds: string[] = [];
const today = () => thaiDate(new Date());

type Node = { type?: string; text?: string; contents?: Node[]; action?: { label: string; data?: string; type: string }; header?: Node; body?: Node; footer?: Node };
const textsOf = (n: Node | undefined): string[] =>
  !n ? [] : [n.text ?? "", ...[n.header, n.body, n.footer, ...(n.contents ?? [])].flatMap(textsOf)].filter(Boolean);
const buttonsOf = (n: Node | undefined): { label: string; data?: string; type: string }[] =>
  !n ? [] : [...(n.type === "button" && n.action ? [n.action] : []), ...[n.header, n.body, n.footer, ...(n.contents ?? [])].flatMap(buttonsOf)];
const last = () => replies.at(-1)![0];
const flat = (m = last()) => (m.type === "text" ? m.text : [m.altText, ...textsOf(m.contents as Node)].join(" "));
const buttons = (m = last()) => [...(m.type === "flex" ? buttonsOf(m.contents as Node) : []), ...(m.quickReply?.items.map((i) => i.action) ?? [])];
const data = (label: string) => (buttons().find((b) => b.label === label) as { data: string }).data;

function deliver(event: Record<string, unknown>) {
  const body = JSON.stringify({ events: [event] });
  return webhook(
    new Request("http://localhost/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": createHmac("sha256", secret).update(body).digest("base64") },
      body,
    }),
  );
}
const nextId = (p: string) => {
  const id = `${p}_${run}_${eventIds.length}`;
  eventIds.push(id);
  return id;
};
const photo = (line = lineA) => {
  const id = nextId("OI");
  return deliver({ type: "message", webhookEventId: id, replyToken: `rt-${id}`, source: { type: "user", userId: line }, message: { type: "image", id: `m-${id}` } });
};
const chat = (text: string, line = lineA) => {
  const id = nextId("OT");
  return deliver({ type: "message", webhookEventId: id, replyToken: `rt-${id}`, source: { type: "user", userId: line }, message: { type: "text", text } });
};
const tap = (d: string, line = lineA) => {
  const id = nextId("OP");
  return deliver({ type: "postback", webhookEventId: id, replyToken: `rt-${id}`, source: { type: "user", userId: line }, postback: { data: d } });
};

async function figma(line = lineA) {
  const res = await createCycle(
    new Request("http://localhost/api/cycle", {
      method: "POST",
      headers: { Authorization: `Bearer ${line}` },
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

const aiReads = (o: object) => vi.mocked(generateFromImage).mockResolvedValueOnce(JSON.stringify(o));
const slip = (o: object = {}) => ({ is_slip: true, kind: "expense", merchant: "ร้านข้าวมันไก่ป้าศรี", amount_baht: 150, candidates_baht: [], date: today(), ...o });

async function rows(table: "entries" | "incomes", line = lineA) {
  const { data: u } = await db.from("users").select("id").eq("line_user_id", line).single();
  const { data: r } = await db.from(table).select("amount, note, source").eq("user_id", u!.id).is("cancelled_at", null);
  return r!;
}

beforeEach(() => {
  replies.length = 0;
  vi.stubEnv("LINE_CHANNEL_SECRET", secret);
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  vi.mocked(generateFromImage).mockReset().mockResolvedValue(null);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await db.from("line_events").delete().in("webhook_event_id", eventIds);
  await db.from("users").delete().in("line_user_id", [lineA, lineB]);
});

describe("OCR: a slip photo in the chat", () => {
  it("a clear slip → โฟรวิว's draft card; nothing recorded yet", async () => {
    await figma();
    aiReads(slip());
    await photo();
    expect(last().type).toBe("flex");
    expect(flat()).toContain("ร้านข้าวมันไก่ป้าศรี");
    expect(flat()).toContain("150 บาท");
    expect(buttons().map((b) => b.label)).toEqual(expect.arrayContaining(["บันทึก", "แก้ยอด", "ยกเลิก"]));
    expect(await rows("entries")).toEqual([]);
  });

  it("บันทึก records it once as an OCR spend, with the recorded card", async () => {
    await figma();
    aiReads(slip());
    await photo();
    const save = data("บันทึก");
    await tap(save);
    expect(flat()).toContain("จดแล้ว ✓ ร้านข้าวมันไก่ป้าศรี 150 บาท");
    await tap(save);
    expect(await rows("entries")).toEqual([{ amount: 15000, note: "ร้านข้าวมันไก่ป้าศรี", source: "ocr" }]);
  });

  it("แก้ยอด: «120» shows the draft again with 120, and บันทึก records 120", async () => {
    await figma();
    aiReads(slip());
    await photo();
    await tap(data("แก้ยอด"));
    expect(flat()).toContain("พิมพ์ยอดที่ถูกต้อง");
    await chat("120");
    expect(last().type).toBe("flex");
    expect(flat()).toContain("120 บาท");
    await tap(data("บันทึก"));
    expect(await rows("entries")).toEqual([expect.objectContaining({ amount: 12000 })]);
  });

  it("several amounts: pick one, then บันทึก records that one", async () => {
    await figma();
    aiReads(slip({ amount_baht: 120, candidates_baht: [120, 100] }));
    await photo();
    await tap(data("ยอด 100 บาท"));
    expect(flat()).toContain("100 บาท");
    await tap(data("บันทึก"));
    expect(await rows("entries")).toEqual([expect.objectContaining({ amount: 10000 })]);
  });

  it("not sure which kind: asks รายจ่าย / รับเงิน / โอนระหว่างบัญชี; รับเงิน then บันทึก records income, not a spend", async () => {
    await figma();
    aiReads(slip({ kind: "unknown", merchant: "แม่" }));
    await photo();
    expect(buttons().map((b) => b.label)).toEqual(expect.arrayContaining(["รายจ่าย", "รับเงิน", "โอนระหว่างบัญชี"]));
    await tap(data("รับเงิน"));
    await tap(data("บันทึก"));
    expect(flat()).toContain("รับเงินแล้ว ✓ +150 บาท");
    expect(await rows("entries")).toEqual([]);
    expect(await rows("incomes")).toEqual([expect.objectContaining({ amount: 15000 })]);
  });

  it("โอนระหว่างบัญชี (own accounts): nothing recorded", async () => {
    await figma();
    aiReads(slip({ kind: "transfer" }));
    await photo();
    await tap(data("โอนระหว่างบัญชี"));
    expect(flat()).toContain("ไม่นับเป็นรายจ่าย");
    expect(await rows("entries")).toEqual([]);
    expect(await rows("incomes")).toEqual([]);
  });

  it("ยกเลิก: nothing recorded, and its บันทึก does nothing afterwards", async () => {
    await figma();
    aiReads(slip());
    await photo();
    const save = data("บันทึก");
    await tap(data("ยกเลิก"));
    expect(flat()).toContain("ยกเลิกแล้ว");
    await tap(save);
    expect(await rows("entries")).toEqual([]);
  });

  it("the same amount already recorded today: the card warns it may be a duplicate (but does not block)", async () => {
    await figma();
    await chat("ข้าวมันไก่ 100"); // within today's 120, so it is recorded (150 would be held, L6)
    aiReads(slip({ amount_baht: 100 }));
    await photo();
    expect(flat()).toContain("รายการนี้คล้าย");
  });

  it("unreadable, not a slip, or Gemini busy → type it instead; nothing recorded (user's choice)", async () => {
    await figma();
    await photo(); // AI off/busy
    expect(flat()).toContain("อ่านสลิปไม่ออก");
    aiReads({ is_slip: false });
    await photo();
    expect(flat()).toContain("อ่านสลิปไม่ออก");
    expect(await rows("entries")).toEqual([]);
  });

  it("someone else's draft id does nothing", async () => {
    await figma();
    aiReads(slip());
    await photo();
    const save = data("บันทึก");
    await figma(lineB);
    await tap(save, lineB);
    expect(flat()).toContain("หมดเวลา");
    expect(await rows("entries", lineB)).toEqual([]);
  });

  it("before setup: set up first", async () => {
    await photo();
    expect(flat()).toContain("ยังไม่ได้ตั้งรอบเงิน");
  });
});
