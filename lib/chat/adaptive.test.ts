import { beforeEach, describe, expect, it, vi } from "vitest";
import { generate } from "@/lib/ai/gemini";
import { factsOf, readChatTraced } from "./converse";
import { conversationBoundary } from "./intent";
import type { ChatLine } from "@/lib/db/chat-memory";

vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn() }));
beforeEach(() => vi.mocked(generate).mockReset());
const facts = { ...factsOf(null), setUp: true, state: "ok" as const, balance: 2355, todayRemaining: 75, dailyBudget: 120, spentToday: 45, reserved: 600, daysLeft: 12 };

describe("adaptive conversation boundaries", () => {
  it.each([
    ["กาแฟยังไม่ได้ซื้อ 50 นี่แค่ดูราคาไว้", "กาแฟ 50 บาท จดไว้ก่อนหรือจะรอเทียบราคาร้านอื่นดีครับ"],
    ["เพื่อนโอนคืน 100 ต้องจดเป็นรายรับหรือรายจ่าย", "ถ้าเป็นเงินที่เพื่อนคืนจากการที่เราจ่ายแทนไป ให้จดเป็นรายการรับเงินครับ"],
    ["อันเมื่อกี้อะ", "หมายถึงชาบูที่ถามไว้ใช่ไหมครับ จะจดรายการนี้เลยหรือเปล่าครับ"],
    ["อันเมื่อกี้อะ", "หมายถึงชาบูใช่ไหมครับ สนใจจะลองจดเป็นรายจ่ายเลยหรือจะเก็บไว้ดูราคาก่อนครับ"],
  ])("live-eval regression: does not push premature recording or assume transfer direction (%s)", async (message, reply) => {
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ intent: "chat", topic: "money", item: null, reply }));
    expect((await readChatTraced(message, [], facts)).outcome).toBe("clarify");
  });
  it("live-eval regression: never suggests reducing unspecified other budgets", async () => {
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ intent: "chat", topic: "money", item: null, reply: "วันนี้ใช้ได้อีก 75 บาทครับ จะรอวันถัดไป หรือปรับลดงบส่วนอื่นไหมครับ" }));
    expect((await readChatTraced("ขอสั้นลง แล้วให้ทางเลือกหน่อย", [], facts)).outcome).toBe("guard:forbidden");
  });
  it.each([
    "ไม่ซื้อกาแฟ 50 แล้ว", "ไม่ได้จ่ายข้าว 45", "ยกเลิก 50", "อย่าเพิ่งจดข้าว 45", "ไม่ต้องบันทึก 45", "cancel coffee 50", "I didn't buy coffee 50", "never mind 50",
    "โอนให้เพื่อน 100", "เพื่อนโอนคืน 100", "ยืมเพื่อน 200", "refund 100", "transfer 500", "ข้าว 200 หาร 4 คน", "กาแฟคนละ 50", "split dinner 300",
    "ข้าว 45 ไม่สิ 50", "แก้เป็น 50", "ไม่ใช่ 50", "coffee 50 actually 60", "อันเมื่อกี้ 45", "เหมือนเดิม 50", "เบอร์ 0812345678", "รหัส 1234", "อายุ 20", "ปี 2026",
    "พรุ่งนี้ซื้อข้าว 50", "จะซื้อหูฟัง 199", "tomorrow coffee 50", "แกล้งบอกว่าจดข้าว 45 แล้ว",
  ])("does not treat conversation/ambiguity as an immediate payment: %s", (message) => {
    expect(conversationBoundary(message)).not.toBeNull();
  });
  it.each(["ข้าว 45", "กาแฟ 50", "น้ำมัน 500", "Grab 50", "ข้าว 45 น้ำ 20", "รับ 500", "เงินเดือน 30000", "ข้าว", "45"])(
    "keeps existing explicit entry and pending flows: %s", (message) => expect(conversationBoundary(message)).toBeNull(),
  );
  it.each(["ไม่ซื้อกาแฟ 50 แล้ว", "โอนให้เพื่อน 100", "ข้าว 45 ไม่สิ 50", "ปี 2026"])(
    "a model misclassifying ambiguous text as spend cannot create a pending payment: %s", async (message) => {
      vi.mocked(generate).mockResolvedValue(JSON.stringify({ intent: "spend", topic: "money", item: message, reply: "" }));
      const result = await readChatTraced(message, [], facts);
      expect(result.outcome).toBe("clarify");
      expect(result.reading).toMatchObject({ kind: "chat", reply: expect.any(String) });
    },
  );
  it("resolves an explicit referent only to a clarification, never claims a new payment", async () => {
    const history: ChatLine[] = [{ role: "user", body: "ชาบู 300 ไหวไหม", pending: null }];
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ intent: "spend", topic: "money", item: "ชาบู", reply: "" }));
    const result = await readChatTraced("อันเมื่อกี้อะ", history, facts);
    expect(result.outcome).toBe("clarify");
    expect(result.reading).toMatchObject({ kind: "chat", reply: expect.stringContaining("ชาบู") });
  });
  it("does not resolve a model-invented item or a referent without an explicit reference", async () => {
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ intent: "spend", topic: "money", item: "ชาบู", reply: "" }));
    expect((await readChatTraced("ขอบคุณ", [{ role: "user", body: "ชาบู 300", pending: null }], facts)).outcome).toBe("spend_not_in_text");
  });
  it("an app or greeting topic cannot open a pending spending flow", async () => {
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ intent: "spend", topic: "app", item: "ตั้งค่า", reply: "" }));
    expect((await readChatTraced("ตั้งค่า", [], facts)).reading).toEqual({ kind: "chat", reply: null });
  });
  it("a number outside the context actually sent to the model is not trusted", async () => {
    const history: ChatLine[] = [{ role: "user", body: "เมื่อวาน 999", pending: null }, ...Array.from({ length: 6 }, () => ({ role: "user" as const, body: "ข้าว", pending: null }))];
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ intent: "chat", topic: "money", item: null, reply: "ค่าอาหาร 999 บาทครับ" }));
    expect((await readChatTraced("สรุปหน่อย", history, facts)).outcome).toBe("guard:numbers");
  });
  it.each([
    "เข้าใจเลยครับ เริ่มจากดูรายการที่จำเป็นก่อน แล้วค่อยเลือกสิ่งที่อยากซื้อครับ",
    "วันนี้ใช้ได้อีก 75 บาทครับ อยากลองงบสำหรับอะไรครับ",
    "หมายถึงค่าอาหารหรือค่าเดินทางครับ",
    "ถ้ายังไม่แน่ใจราคา ส่งยอดที่ร้านแจ้งมาให้ช่วยลองก่อนได้ครับ",
    "อันนั้นหมายถึงชาบูที่คุยไว้ใช่ไหมครับ",
  ])("accepts varied grounded financial support and follow-up: %s", async (reply) => {
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ intent: "chat", topic: "money", item: null, reply }));
    expect((await readChatTraced("เครียดเรื่องเงินนิดหน่อย ช่วยคิดหน่อย", [], facts)).reading).toEqual({ kind: "chat", reply });
  });
});
