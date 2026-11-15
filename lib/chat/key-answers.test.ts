import { describe, expect, it } from "vitest";
import type { Summary } from "@/lib/api-types";
import type { BudgetResult } from "@/lib/calc/budget";
import { enoughAnswer, paydayAnswer } from "@/lib/chat/cards";

// «วันเงินเข้าเมื่อไร», «เงินพอถึงวันเงินเข้าไหม»: the line on top of today's card. Every number from the
// calculator; «สิ้นเดือน» is answered against payday (the only date the calculator knows), and says so.

const ok = (o: Partial<Extract<BudgetResult, { kind: "ok" }>> = {}): BudgetResult => ({
  kind: "ok", usable: 144000, dailyBudget: 12000, todayRemaining: 12000, daysLeft: 12,
  spare: 60000, maxPurchase: 60000, essentialShortPerDay: 0, ...o,
});
const summary = (budget: BudgetResult, essentialPerDay: number | null = 7000): Summary => ({
  today: "2026-11-15", payday: "2026-11-27", balance: 240000, balanceAsOf: "2026-11-15T00:00:00Z", spentToday: 0,
  savings: 24000, emergencyBuffer: 12000, reserved: 60000, essentialPerDay, budget, basis: "b",
});

describe("paydayAnswer", () => {
  it("the date and the days left", () => {
    expect(paydayAnswer(summary(ok()))).toBe("เงินเข้าวันที่ 27 พ.ย. · อีก 12 วัน");
  });
  it("short of money still says when it comes", () => {
    expect(paydayAnswer(summary({ kind: "shortfall", usable: -5000, shortfall: 5000, daysLeft: 12 }))).toBe("เงินเข้าวันที่ 27 พ.ย. · อีก 12 วัน");
  });
  it("payday passed: set up the next round", () => {
    expect(paydayAnswer(summary({ kind: "payday-passed", usable: 1000 }))).toContain("เลยวันเงินเข้า 27 พ.ย. มาแล้ว");
  });
});

describe("enoughAnswer", () => {
  it("enough when the daily budget is kept, against payday", () => {
    expect(enoughAnswer(summary(ok()))).toBe("พอครับ ถ้าใช้ไม่เกินวันละ 120 บาท ถึงวันเงินเข้า 27 พ.ย.");
  });
  it("food and transport not set yet: still the daily budget", () => {
    expect(enoughAnswer(summary(ok({ spare: null }), null))).toBe("พอครับ ถ้าใช้ไม่เกินวันละ 120 บาท ถึงวันเงินเข้า 27 พ.ย.");
  });
  it("food and transport every day would run out: how much short", () => {
    expect(enoughAnswer(summary(ok({ spare: -15050 }), 13000))).toBe("ยังไม่พอครับ ถ้าค่ากินค่ารถวันละ 130 บาท จะขาด 150.50 บาทก่อนเงินเข้า 27 พ.ย.");
  });
  it("short already: the shortfall", () => {
    expect(enoughAnswer(summary({ kind: "shortfall", usable: -5000, shortfall: 5000, daysLeft: 12 }))).toBe("ไม่พอครับ ตอนนี้ขาดอยู่ 50 บาท (บิล เงินออม และเงินเผื่อมากกว่าเงินที่มี)");
  });
  it("payday passed: the same as asking when it comes", () => {
    expect(enoughAnswer(summary({ kind: "payday-passed", usable: 1000 }))).toContain("เลยวันเงินเข้า 27 พ.ย. มาแล้ว");
  });
});
