import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Summary } from "@/lib/api-types";
import { generate } from "@/lib/ai/gemini";
import { factsOf, inText, itemsFrom, knownNumbers, readChat, replyOk, splitItems } from "@/lib/chat/converse";

vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null) }));
const ai = vi.mocked(generate);

// Figma numbers: 120 a day, 75 left after ข้าว 45, 12 days
const summary: Summary = {
  today: "2026-11-13",
  payday: "2026-11-25",
  balance: 235500,
  balanceAsOf: "2026-11-13T00:00:00Z",
  spentToday: 4500,
  savings: 24000,
  emergencyBuffer: 12000,
  reserved: 60000,
  essentialPerDay: 7000,
  budget: { kind: "ok", usable: 144000, dailyBudget: 12000, todayRemaining: 7500, daysLeft: 12, spare: 0, maxPurchase: 0, essentialShortPerDay: 0 },
  basis: "b",
};

describe("facts the AI may talk about", () => {
  it("only numbers from the summary, in baht — no LINE id, name or list of spends", () => {
    expect(factsOf(summary)).toEqual({
      setUp: true,
      state: "ok",
      todayRemaining: 75,
      dailyBudget: 120,
      spentToday: 45,
      balance: 2355,
      reserved: 600,
      daysLeft: 12,
    });
  });

  it("before setup: nothing to say but that", () => {
    expect(factsOf(null)).toEqual({ setUp: false, state: null, todayRemaining: null, dailyBudget: null, spentToday: null, balance: null, reserved: null, daysLeft: null });
  });

  it("known numbers = the facts plus what the user typed", () => {
    expect(knownNumbers(factsOf(summary), ["ซื้อหูฟัง 700 ได้ไหม"]).sort((a, b) => a - b)).toEqual([12, 45, 75, 120, 600, 700, 2355]);
  });
});

describe("guarding the AI's chat reply", () => {
  const known = [75, 120];
  it("passes a friendly reply that keeps to the known numbers", () => {
    expect(replyOk("สวัสดี! วันนี้ยังใช้ได้อีก 75 บาทนะ", known)).toBe(true);
  });
  it("rejects a number it made up, cutting food or transport, using savings, or claiming it saved something", () => {
    expect(replyOk("วันนี้ใช้ได้อีก 80 บาท", known)).toBe(false);
    expect(replyOk("ลองลดค่ากินดูนะ", known)).toBe(false);
    expect(replyOk("ใช้เงินออมก่อนก็ได้", known)).toBe(false);
    expect(replyOk("จดแล้วนะ", known)).toBe(false);
    expect(replyOk("บันทึกให้แล้ว", known)).toBe(false);
  });
  it("rejects an empty or long reply", () => {
    expect(replyOk("  ", known)).toBe(false);
    expect(replyOk("ก".repeat(401), known)).toBe(false);
  });
});

describe("guarding the AI's split of several spends", () => {
  const msg = "ข้าว 45 น้ำ 20";
  it("uses only titles and amounts the user typed; category by the rules", () => {
    expect(itemsFrom({ items: [{ title: "ข้าว", amount_baht: 45 }, { title: "น้ำ", amount_baht: 20 }] }, msg)).toEqual([
      { title: "ข้าว", amount: 4500, category: "food" },
      { title: "น้ำ", amount: 2000, category: "food" },
    ]);
  });
  it("rejects an amount nobody typed, one used twice, or a title not in the message", () => {
    expect(itemsFrom({ items: [{ title: "ข้าว", amount_baht: 50 }, { title: "น้ำ", amount_baht: 20 }] }, msg)).toBeNull();
    expect(itemsFrom({ items: [{ title: "ข้าว", amount_baht: 45 }, { title: "น้ำ", amount_baht: 45 }] }, msg)).toBeNull();
    expect(itemsFrom({ items: [{ title: "ชาบู", amount_baht: 45 }] }, msg)).toBeNull();
  });
  it("the same amount typed twice may be used twice", () => {
    expect(itemsFrom({ items: [{ title: "ข้าว", amount_baht: 20 }, { title: "น้ำ", amount_baht: 20 }] }, "ข้าว 20 น้ำ 20")).toHaveLength(2);
  });
  it("rejects nothing, too many, zero, too large or malformed", () => {
    expect(itemsFrom({ items: [] }, msg)).toBeNull();
    expect(itemsFrom({ items: Array(6).fill({ title: "ข้าว", amount_baht: 1 }) }, "ข้าว 1 1 1 1 1 1")).toBeNull();
    expect(itemsFrom({ items: [{ title: "ข้าว", amount_baht: 0 }] }, "ข้าว 0 น้ำ 1")).toBeNull();
    expect(itemsFrom({ items: [{ title: "ข้าว", amount_baht: 200000 }] }, "ข้าว 200000 น้ำ 1")).toBeNull();
    expect(itemsFrom({ items: [{ title: 5, amount_baht: 45 }] }, msg)).toBeNull();
    expect(itemsFrom(null, msg)).toBeNull();
  });
  it("reads Thai digits and 1,200 the way the user wrote them", () => {
    expect(itemsFrom({ items: [{ title: "รองเท้า", amount_baht: 1200 }, { title: "ข้าว", amount_baht: 45 }] }, "รองเท้า 1,200 ข้าว ๔๕")).toEqual([
      { title: "รองเท้า", amount: 120000, category: "other" },
      { title: "ข้าว", amount: 4500, category: "food" },
    ]);
  });
  it("a title counts as typed even if the AI drops or adds spaces", () => {
    expect(inText("ข้าวมันไก่", "ข้าว มันไก่ 50 น้ำ 10")).toBe(true);
    expect(inText("Grab", "grab 80 ข้าว 40")).toBe(true);
  });
});

describe("readChat: the AI reads, the code decides", () => {
  beforeEach(() => ai.mockReset());
  const facts = factsOf(summary);

  it("a greeting: the AI's reply when it keeps to the facts", async () => {
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "chat", topic: "money", item: null, reply: "สวัสดี! วันนี้ใช้ได้อีก 75 บาท" }));
    expect(await readChat("Hey", [], facts)).toEqual({ kind: "chat", reply: "สวัสดี! วันนี้ใช้ได้อีก 75 บาท" });
  });

  it("sends the message, the recent chat and the facts — nothing else", async () => {
    ai.mockResolvedValueOnce(null);
    await readChat("เหลือเท่าไร", [{ role: "user", body: "ข้าว 45", pending: null }, { role: "bot", body: "จดแล้ว ✓", pending: null }], facts);
    const input = JSON.parse(ai.mock.calls[0][0].input);
    expect(input).toEqual({
      facts,
      history: [
        { role: "user", text: "ข้าว 45" },
        { role: "bot", text: "จดแล้ว ✓" },
      ],
      message: "เหลือเท่าไร",
    });
  });

  it("a reply with a made-up number falls back to the template (reply null)", async () => {
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "chat", topic: "money", item: null, reply: "เหลือ 999 บาท" }));
    expect(await readChat("เหลือเท่าไร", [], facts)).toEqual({ kind: "chat", reply: null });
  });

  it("a number the user typed earlier in the chat may be repeated", async () => {
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "chat", topic: "money", item: null, reply: "ชาบู 300 ที่ถามเมื่อกี้ใช่ไหม" }));
    const history = [{ role: "user" as const, body: "ชาบู 300 ไหวไหม", pending: null }];
    expect(await readChat("อันเมื่อกี้อะ", history, facts)).toEqual({ kind: "chat", reply: "ชาบู 300 ที่ถามเมื่อกี้ใช่ไหม" });
  });

  it("«ข้าว» with no amount: a spend whose item must be in the message", async () => {
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "spend", topic: "money", item: "ข้าว", reply: "" }));
    expect(await readChat("ข้าวร้อยกว่า", [], facts)).toEqual({ kind: "spend", item: "ข้าว" });
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "spend", topic: "money", item: "ชาบู", reply: "" }));
    expect(await readChat("ข้าว", [], facts)).toEqual({ kind: "chat", reply: null });
  });

  it("off topic (homework, recipes, politics…): the AI's words are dropped, whatever they say", async () => {
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "chat", topic: "other", item: null, reply: "ต้มยำใส่ข่าตะไคร้ใบมะกรูด" }));
    expect(await readChat("สอนทำต้มยำหน่อย", [], facts)).toEqual({ kind: "off_topic" });
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "spend", topic: "other", item: "ต้มยำ", reply: "" }));
    expect(await readChat("ต้มยำ", [], facts)).toEqual({ kind: "off_topic" });
  });

  it("a topic missing or unknown counts as unreadable", async () => {
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "chat", item: null, reply: "สวัสดี" }));
    expect(await readChat("Hey", [], facts)).toBeNull();
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "chat", topic: "weather", item: null, reply: "สวัสดี" }));
    expect(await readChat("Hey", [], facts)).toBeNull();
  });

  it("AI off, failed or unreadable → null (the caller uses its template)", async () => {
    ai.mockResolvedValueOnce(null);
    expect(await readChat("Hey", [], facts)).toBeNull();
    ai.mockResolvedValueOnce("not json");
    expect(await readChat("Hey", [], facts)).toBeNull();
    ai.mockResolvedValueOnce(JSON.stringify({ intent: "dance" }));
    expect(await readChat("Hey", [], facts)).toBeNull();
  });
});

describe("splitItems", () => {
  beforeEach(() => ai.mockReset());
  it("asks the AI with only the message, and guards its answer", async () => {
    ai.mockResolvedValueOnce(JSON.stringify({ items: [{ title: "ข้าว", amount_baht: 45 }, { title: "น้ำ", amount_baht: 20 }] }));
    expect(await splitItems("ข้าว 45 น้ำ 20")).toHaveLength(2);
    expect(ai.mock.calls[0][0].input).toBe("ข้าว 45 น้ำ 20");
    ai.mockResolvedValueOnce(JSON.stringify({ items: [{ title: "ข้าว", amount_baht: 65 }] }));
    expect(await splitItems("ข้าว 45 น้ำ 20")).toBeNull();
    ai.mockResolvedValueOnce(null);
    expect(await splitItems("ข้าว 45 น้ำ 20")).toBeNull();
  });
});
