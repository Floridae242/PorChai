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

  // Bug 13 Nov (phone): «ถ้ากิน ชาบู 150 บาท จะเหลือเงินใช้วันละเท่าไร» was recorded as a 150 baht spend.
  // Any question or "what if" must never be recorded.
  it("questions and what-ifs, however they are asked", () => {
    const questions = [
      "ถ้ากิน ชาบู 150 บาท จะเหลือเงินใช้วันละเท่าไร",
      "ถ้าซื้อรองเท้า 500",
      "สมมติซื้อหูฟัง 700",
      "สมมุติกินหมูกระทะ 250",
      "หากซื้อเสื้อ 300 จะเหลือเท่าไหร่",
      "ชาบู 300 เหลือวันละเท่าไหร่",
      "ซื้อกระเป๋า 900 แล้วเหลือเท่าไร",
      "กินบุฟเฟ่ต์ 399 แล้วเหลือกี่บาท",
      "ซื้อเกม 1,200 ต้องประหยัดกี่วัน",
      "ใช้ 200 แล้วจะพอถึงสิ้นเดือนหรือเปล่า",
      "ซื้อรองเท้า 800 จะพอรึเปล่า",
      "ชาบู 300 ได้ป่ะ",
      "ชาบู 300 ไหวปะ",
      "หมูกระทะ 250 ไหวป่าว",
      "ชาบู 300 มั๊ย",
      "ชาบู 300 ไหวไหมครับ",
      "ชาบู 300 ได้มั้ยคะ",
      "ซื้อหูฟัง 700 ดีมั้ยนะ",
      "ควรซื้อหูฟัง 700 ไหม",
      "หูฟัง 700 ควรซื้อป่ะ",
      "ซื้อหูฟัง 700 ยังไงให้พอ",
      "ทำไมใช้ 300 แล้วเหลือแค่นี้",
      "ชาบู 300？",
      "ชาบู 300 ?",
    ];
    for (const t of questions) expect(isQuestion(t), t).toBe(true);
  });

  it("expenses whose names only look like question words are still expenses", () => {
    const expenses = [
      "น้ำเปล่า 10", // เปล่า as in หรือเปล่า
      "น้ำเปล่า 2 ขวด 20",
      "มะม่วง 30",
      "ผ้าไหม 500", // ไหม = silk
      "เกี๊ยว 40",
      "ถ้วยกาแฟ 25",
      "ไก่ทอด 35",
      "กะเพราไก่ 50",
      "ข้าวมันไก่ 45",
      "ชานมไข่มุก 45",
      "หมูกระทะ 199",
      "Grab 80",
      "ค่าหอ 3000",
      "ข้าวเที่ยง 50",
      "ก๋วยเตี๋ยว 45",
      "ปากกา 15",
      "เติมเงินมือถือ 100",
      "ขนมปัง 25",
      "ค่ารถไปกลับ 60",
      "ข้าว 45 บาท",
    ];
    for (const t of expenses) expect(isQuestion(t), t).toBe(false);
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
