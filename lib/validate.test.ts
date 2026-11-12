import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http";
import {
  parseBalanceCheck,
  parseBufferChange,
  parseEntryPatch,
  parseNewCycle,
  parseNewEntry,
  parseNewPlan,
  parseEssentials,
  parsePayPlan,
  parseTrial,
} from "@/lib/validate";

const TODAY = "2026-11-11";
const NOW = new Date("2026-11-11T05:00:00Z");

function rejects(fn: () => unknown, field: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(422);
    expect((err as HttpError).message).toContain(field);
    return;
  }
  throw new Error("expected a 422");
}

describe("parseNewEntry", () => {
  it("accepts rice 45 and defaults the date to today", () => {
    expect(parseNewEntry({ amount: 4500, category: "food", note: " ข้าว " }, TODAY)).toEqual({
      amount: 4500,
      category: "food",
      note: "ข้าว",
      spentOn: TODAY,
    });
  });

  it("keeps an earlier date", () => {
    expect(parseNewEntry({ amount: 100, category: "other", spentOn: "2026-11-09" }, TODAY).spentOn).toBe(
      "2026-11-09",
    );
  });

  it.each([0, -100, 45.5, "4500", null, Number.MAX_SAFE_INTEGER + 1])("rejects amount %s", (amount) => {
    rejects(() => parseNewEntry({ amount, category: "food" }, TODAY), "ยอด");
  });

  it.each(["bills", "fun", undefined])("rejects category %s (users pick one of four)", (category) => {
    rejects(() => parseNewEntry({ amount: 100, category }, TODAY), "หมวด");
  });

  it.each(["2026-11-12", "2026-13-01", "2026-02-30", "11/11/2026"])("rejects spentOn %s", (spentOn) => {
    rejects(() => parseNewEntry({ amount: 100, category: "food", spentOn }, TODAY), "วันที่");
  });

  it("rejects a note over 200 characters", () => {
    rejects(() => parseNewEntry({ amount: 100, category: "food", note: "ก".repeat(201) }, TODAY), "บันทึก");
  });

  it("rejects a body that is not an object", () => {
    rejects(() => parseNewEntry([1, 2], TODAY), "ข้อมูล");
  });
});

describe("parseEntryPatch", () => {
  it("keeps only the fields sent", () => {
    expect(parseEntryPatch({ amount: 5000 }, TODAY)).toEqual({ amount: 5000 });
    expect(parseEntryPatch({ note: null }, TODAY)).toEqual({ note: null });
  });

  it("rejects an empty change", () => {
    rejects(() => parseEntryPatch({}, TODAY), "ข้อมูล");
  });

  it("applies the same rules as a new entry", () => {
    rejects(() => parseEntryPatch({ category: "bills" }, TODAY), "หมวด");
    rejects(() => parseEntryPatch({ spentOn: "2026-11-12" }, TODAY), "วันที่");
  });
});

describe("parseBalanceCheck", () => {
  it("accepts a balance with no time (the server uses now)", () => {
    expect(parseBalanceCheck({ balance: 200000 }, NOW)).toEqual({ balance: 200000 });
  });

  it("accepts a past time", () => {
    expect(parseBalanceCheck({ balance: 0, asOf: "2026-11-11T01:10:00Z" }, NOW)).toEqual({
      balance: 0,
      asOf: new Date("2026-11-11T01:10:00Z"),
    });
  });

  it("rejects a negative balance", () => {
    rejects(() => parseBalanceCheck({ balance: -1 }, NOW), "ยอด");
  });

  it("rejects a time in the future or not a time", () => {
    rejects(() => parseBalanceCheck({ balance: 100, asOf: "2026-11-11T06:00:00Z" }, NOW), "เวลา");
    rejects(() => parseBalanceCheck({ balance: 100, asOf: "เมื่อเช้า" }, NOW), "เวลา");
  });
});

describe("parseNewCycle", () => {
  // Figma W4–W9: 2,400 · bill 600 · savings 10% · buffer 120 · food 50 + transport 20 · payday in 12 days
  const figma = (over: Record<string, unknown> = {}) => ({
    incomeSource: "family",
    incomeFrequency: "monthly",
    payday: "2026-11-23",
    balance: 240000,
    bills: [{ title: "ค่าหอ", amount: 60000 }],
    savingsPercent: 10,
    emergencyBuffer: 12000,
    essentials: { food: 5000, transport: 2000 },
    ...over,
  });

  it("W4–W9: turns the Figma setup into a cycle with savings frozen at 10% of 2,400", () => {
    expect(parseNewCycle(figma(), TODAY, NOW)).toEqual({
      incomeSource: "family",
      incomeFrequency: "monthly",
      payday: "2026-11-23",
      balance: 240000,
      balanceAsOf: undefined,
      savingsAmount: 24000,
      savingsPercent: 10,
      emergencyBuffer: 12000,
      essentials: { food: 5000, transport: 2000 },
      plans: [{ kind: "bill", title: "ค่าหอ", amount: 60000, dueOn: null, status: "reserved" }],
    });
  });

  it("W5: a bill already paid or paid from other money is kept but never reserved", () => {
    const c = parseNewCycle(
      figma({
        bills: [
          { title: "ค่าน้ำ", amount: 10000, status: "paid" },
          { title: "ค่าหอ", amount: 60000, status: "separate", dueOn: "2026-11-15" },
        ],
      }),
      TODAY,
      NOW,
    );
    expect(c.plans.map((p) => p.status)).toEqual(["paid", "separate"]);
  });

  it("W8: items that can be postponed become purchase plans with their date", () => {
    const c = parseNewCycle(figma({ bills: [], flexibleItems: [{ title: "ทริป", amount: 50000, dueOn: "2026-11-20" }] }), TODAY, NOW);
    expect(c.plans).toEqual([{ kind: "purchase", title: "ทริป", amount: 50000, dueOn: "2026-11-20", status: "reserved" }]);
  });

  it("W6: savings can be a fixed amount instead of a percent", () => {
    const c = parseNewCycle(figma({ savingsPercent: undefined, savingsAmount: 25000 }), TODAY, NOW);
    expect([c.savingsAmount, c.savingsPercent]).toEqual([25000, null]);
  });

  it("everything optional left out: no savings, buffer 0, essentials not set (null, ask later)", () => {
    const c = parseNewCycle(
      { incomeSource: "side_job", incomeFrequency: "irregular", payday: "2026-11-20", balance: 100000 },
      TODAY,
      NOW,
    );
    expect(c).toMatchObject({ savingsAmount: 0, savingsPercent: null, emergencyBuffer: 0, essentials: null, plans: [] });
  });

  it("W5: keeps the time the balance was read", () => {
    const c = parseNewCycle(figma({ balanceAsOf: "2026-11-11T01:10:00Z" }), TODAY, NOW);
    expect(c.balanceAsOf).toEqual(new Date("2026-11-11T01:10:00Z"));
  });

  it("card 03: payday today or earlier is refused (nothing to divide by; ask if the money came)", () => {
    rejects(() => parseNewCycle(figma({ payday: TODAY }), TODAY, NOW), "วันเงินเข้า");
    rejects(() => parseNewCycle(figma({ payday: "2026-11-01" }), TODAY, NOW), "วันเงินเข้า");
  });

  it("card 19: savings plus buffer cannot be more than the money on hand", () => {
    rejects(() => parseNewCycle(figma({ balance: 30000, savingsPercent: 50, emergencyBuffer: 20000 }), TODAY, NOW), "เกินเงินที่มี");
  });

  it.each([
    ["incomeSource", "lottery", "แหล่งเงิน"],
    ["incomeFrequency", "daily", "ความถี่"],
    ["balance", -1, "ยอด"],
    ["savingsPercent", 0, "ออม"],
    ["savingsPercent", 101, "ออม"],
    ["emergencyBuffer", -1, "เผื่อ"],
    ["balanceAsOf", "2026-11-11T06:00:00Z", "เวลา"],
  ])("rejects %s = %s", (field, value, word) => {
    rejects(() => parseNewCycle(figma({ [field]: value }), TODAY, NOW), word);
  });

  it("rejects savings given both as percent and amount", () => {
    rejects(() => parseNewCycle(figma({ savingsAmount: 1000 }), TODAY, NOW), "ออม");
  });

  it("rejects essentials with only food or only transport", () => {
    rejects(() => parseNewCycle(figma({ essentials: { food: 5000 } }), TODAY, NOW), "ค่ากิน");
  });

  it.each([
    [{ title: "", amount: 100 }, "ชื่อ"],
    [{ title: "ค่าหอ", amount: 0 }, "ยอด"],
    [{ title: "ค่าหอ", amount: 100, status: "maybe" }, "สถานะ"],
    [{ title: "ค่าหอ", amount: 100, status: "constructor" }, "สถานะ"],
    [{ title: "ค่าหอ", amount: 100, dueOn: "15/11" }, "วันที่"],
  ])("rejects a bad bill %j", (bill, word) => {
    rejects(() => parseNewCycle(figma({ bills: [bill] }), TODAY, NOW), word);
  });

  it("rejects more than 20 bills", () => {
    const bills = Array.from({ length: 21 }, () => ({ title: "x", amount: 100 }));
    rejects(() => parseNewCycle(figma({ bills }), TODAY, NOW), "ไม่เกิน 20");
  });
});

describe("parseNewPlan", () => {
  it("W15 เก็บไว้ในแผน: a purchase kept in the plan by default", () => {
    expect(parseNewPlan({ title: " รองเท้า ", amount: 48000 })).toEqual({
      kind: "purchase",
      title: "รองเท้า",
      amount: 48000,
      dueOn: null,
      category: null,
      status: "reserved",
    });
  });

  it("W15 เลื่อนไปรอบหน้า: status postponed, with a category for when it is paid", () => {
    expect(parseNewPlan({ title: "ทริป", amount: 60000, status: "postponed", category: "other", dueOn: "2026-12-01" })).toMatchObject({
      status: "postponed",
      category: "other",
      dueOn: "2026-12-01",
    });
  });

  it("accepts a bill, which always pays into 'bills'", () => {
    expect(parseNewPlan({ kind: "bill", title: "ค่าเน็ต", amount: 20000 })).toMatchObject({ kind: "bill", category: null });
  });

  it("rejects a category on a bill", () => {
    rejects(() => parseNewPlan({ kind: "bill", title: "ค่าเน็ต", amount: 20000, category: "food" }), "บิล");
  });

  it("rejects paid / cancelled / separate as a starting status", () => {
    for (const status of ["paid", "cancelled", "separate", "constructor"]) {
      rejects(() => parseNewPlan({ title: "x", amount: 100, status }), "สถานะ");
    }
  });

  it("rejects a bad kind, title, amount or category", () => {
    rejects(() => parseNewPlan({ kind: "gift", title: "x", amount: 100 }), "ชนิด");
    rejects(() => parseNewPlan({ title: "", amount: 100 }), "ชื่อรายการ");
    rejects(() => parseNewPlan({ title: "x", amount: 0 }), "ยอดเงิน");
    rejects(() => parseNewPlan({ title: "x", amount: 100, category: "bills" }), "หมวด");
  });
});

describe("parsePayPlan", () => {
  it("category is optional", () => {
    expect(parsePayPlan({})).toEqual({ category: null });
    expect(parsePayPlan({ category: "supplies" })).toEqual({ category: "supplies" });
  });

  it("rejects 'bills' or an unknown category", () => {
    rejects(() => parsePayPlan({ category: "bills" }), "หมวด");
    rejects(() => parsePayPlan({ category: "x" }), "หมวด");
  });
});

describe("parseTrial", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("W11: an item to try, nothing else", () => {
    expect(parseTrial({ amount: 48000 })).toEqual({
      amount: 48000,
      dueOn: null,
      postponePlanIds: [],
      essentials: null,
      emergencyBuffer: null,
    });
  });

  it("14: postponing held plans, with or without an item; duplicates once", () => {
    expect(parseTrial({ postponePlanIds: [id, id] })).toMatchObject({ amount: 0, postponePlanIds: [id] });
  });

  it("14: the essentials the user just answered, for this try", () => {
    expect(parseTrial({ amount: 100, essentials: { food: 5000, transport: 2000 } }).essentials).toEqual({
      food: 5000,
      transport: 2000,
    });
  });

  it("rejects an empty try, a bad amount, bad plan ids or half the essentials", () => {
    rejects(() => parseTrial({}), "ราคา");
    rejects(() => parseTrial({ amount: 0 }), "ยอดเงิน");
    rejects(() => parseTrial({ postponePlanIds: "x" }), "รายการ");
    rejects(() => parseTrial({ postponePlanIds: ["x"] }), "แผน");
    rejects(() => parseTrial({ amount: 100, essentials: { food: 5000 } }), "ทั้งคู่");
  });
});

describe("parseEssentials", () => {
  it("food and transport a day, both required", () => {
    expect(parseEssentials({ food: 5000, transport: 0 })).toEqual({ food: 5000, transport: 0 });
    rejects(() => parseEssentials({ food: 5000 }), "ทั้งคู่");
    rejects(() => parseEssentials({ food: -1, transport: 0 }), "ค่ากิน");
  });
});

describe("parseBufferChange", () => {
  it("the new amount and the one the screen showed", () => {
    expect(parseBufferChange({ amount: 0, previous: 12000 })).toEqual({ amount: 0, previous: 12000 });
  });

  it("rejects a missing or negative amount or previous", () => {
    rejects(() => parseBufferChange({ amount: -1, previous: 0 }), "เงินเผื่อ");
    rejects(() => parseBufferChange({ amount: 100 }), "ค่าเดิม");
  });
});

describe("parseTrial — card 19 buffer", () => {
  it("a try may change only the buffer", () => {
    expect(parseTrial({ emergencyBuffer: 0 })).toMatchObject({ amount: 0, emergencyBuffer: 0 });
    expect(parseTrial({ amount: 100 }).emergencyBuffer).toBeNull();
    rejects(() => parseTrial({ emergencyBuffer: -1 }), "เงินเผื่อ");
  });
});
