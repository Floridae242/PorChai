import { describe, expect, it } from "vitest";
import { isQuestion, numbersIn, onlyKnownNumbers, readQuestion } from "@/lib/advice/question";

// Card 15: which chat messages are questions, the rule reading used when the AI is not available,
// and the guard that keeps the AI from inventing numbers.

describe("isQuestion", () => {
  it("asking whether something is affordable", () => {
    for (const t of ["พรุ่งนี้กินชาบู 300 บาทไหวไหม", "ซื้อหูฟัง 700 ได้มั้ย", "ชาบู 300 พอไหม", "ชาบู 300?", "กินหมูกระทะ 250 ดีไหม"]) {
      expect(isQuestion(t)).toBe(true);
    }
  });

  it("a plain expense is not a question (card 09 records it)", () => {
    for (const t of ["ข้าว 45", "ชาบู 350", "BTS 47"]) expect(isQuestion(t)).toBe(false);
  });
});

describe("readQuestion — rules, when the AI is not available", () => {
  it("«พรุ่งนี้กินชาบู 300 บาทไหวไหม» → ชาบู 300 tomorrow", () => {
    expect(readQuestion("พรุ่งนี้กินชาบู 300 บาทไหวไหม")).toEqual({ item: "ชาบู", amount: 30000, day: "tomorrow" });
  });

  it("today by default; มะรืน = the day after tomorrow", () => {
    expect(readQuestion("ซื้อหูฟัง 700 ได้มั้ย")).toMatchObject({ item: "หูฟัง", amount: 70000, day: "today" });
    expect(readQuestion("มะรืนดูหนัง 200 ไหวไหม")).toMatchObject({ amount: 20000, day: "day_after_tomorrow" });
  });

  it("no amount, several or approximate → amount unknown (ask, never guess)", () => {
    expect(readQuestion("ชาบูไหวไหม").amount).toBeNull();
    expect(readQuestion("ชาบู 300 หรือ 500 ดี?").amount).toBeNull();
    expect(readQuestion("ชาบูร้อยกว่าไหวไหม").amount).toBeNull();
  });
});

describe("onlyKnownNumbers — the AI may not invent numbers", () => {
  it("reads numbers as written (commas, decimals, Thai digits)", () => {
    expect(numbersIn("งบ 1,440 บาท เหลือ ๙๙ และ 12.5")).toEqual([1440, 99, 12.5]);
  });

  it("passes when every number came from the calculator; fails on any other", () => {
    const known = [300, 120, 95, 70];
    expect(onlyKnownNumbers("ไหว ชาบู 300 งบจาก 120 เหลือ 95 ค่ากิน 70 ยังพอ", known)).toBe(true);
    expect(onlyKnownNumbers("ไหว เหลือวันละ 96", known)).toBe(false);
    expect(onlyKnownNumbers("ไม่มีตัวเลขเลย", known)).toBe(true);
  });
});
