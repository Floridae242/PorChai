import { describe, expect, it } from "vitest";
import { isBalanceQuestion, isIncomeQuestion, isEnoughQuestion, isPaydayQuestion, isQuestion, isTomorrowQuestion, numbersIn, onlyKnownNumbers, readQuestion } from "@/lib/advice/question";

it.each(["อยากกินหมูกระทะวันศุกร์", "อยากซื้อหูฟัง 199", "อยากดื่มกาแฟ 50", "อยากสั่งข้าว 45"])(
  "future purchase intent is a what-if, never an immediate payment: %s", (text) => expect(isQuestion(text)).toBe(true),
);

// Card 15: which chat messages are questions, the rule reading used when the AI is not available,
// and the guard that keeps the AI from inventing numbers.

// «เหลือเท่าไร»: asking what is left is answered with the budget card from the calculator, never the AI.
// Only the plain ask: an item, a price or another time span («สัปดาห์นี้») still goes the old way.
describe("isBalanceQuestion", () => {
  it("asking what is left or spent today, however it is asked", () => {
    const asks = [
      "เหลือเท่าไร",
      "เหลือเท่าไหร่",
      "เหลือกี่บาท?",
      "เหลือเงินเท่าไร",
      "ตอนนี้เหลือเงินเท่าไร",
      "วันนี้เหลือเท่าไร",
      "เหลือเงินทั้งหมดเท่าไร",
      "เงินเหลือเท่าไหร่ครับ",
      "ยังเหลืออีกเท่าไหร่",
      "งบเหลือป่ะ",
      "งบเหลือไหม",
      "วันนี้ใช้ไปเท่าไร",
      "วันนี้ใช้ไปแล้วเท่าไหร่คะ",
      "วันนี้ใช้ได้เท่าไหร่",
      "ใช้ได้อีกเท่าไรนะ",
      "เหลือวันละเท่าไร",
      "เช็คยอด",
      "เช็คยอดเงิน",
      "ดูยอดหน่อย",
      "ยอดเงิน",
      "งบวันนี้",
      "เหลือเท่าไร ?",
      // 15 Nov: «ได้» on its own after «เงิน» was left over, so these went to the AI
      "วันนี้ใช้เงินได้เท่าไร",
      "ใช้เงินได้อีกเท่าไหร่",
      "วันนี้ใช้เงินได้อีกกี่บาท",
      "เหลือเงินใช้ได้เท่าไร",
    ];
    for (const t of asks) expect(isBalanceQuestion(t), t).toBe(true);
  });

  it("an item, a price, another day or another span is not this ask", () => {
    const others = [
      "สัปดาห์นี้ใช้ไปเท่าไร", // a span: the report card (15 Nov), not today's budget
      "เดือนนี้ใช้ไปเท่าไร",
      "เมื่อวานใช้ไปเท่าไร",
      "ถ้ากินชาบูจะเหลือเท่าไร", // an item: the AI asks its price
      "กินตี๋น้อยเหลือเท่าไร",
      "ซื้อรองเท้าแล้วเหลือเท่าไร",
      "ชาบู 150 จะเหลือเท่าไร", // a price: try before you buy
      "เหลือ 200",
      "ข้าว 45",
      "ทำไมเหลือน้อยจัง",
      "เหลือ",
      "วันนี้",
      "ดูหน่อย", // asks to see, but not what is left
      "ได้เงินเท่าไร", // income, not what is left
      "ซื้อได้ไหม",
      "ไหม",
      "สวัสดี",
      "",
    ];
    for (const t of others) expect(isBalanceQuestion(t), t).toBe(false);
  });
});

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

// 15 Nov: these went to the AI (or the "cannot answer" template). Today's card answers them, its numbers
// from the calculator. A message with an item or a price is not this ask.
describe("isPaydayQuestion", () => {
  it.each(["วันเงินเข้าเมื่อไร", "เงินเข้าวันไหน", "อีกกี่วันเงินเข้า", "วันรับเงินเมื่อไหร่ครับ", "อีกกี่วันจะถึงวันเงินเข้า", "เงินออกวันไหน", "เงินเข้าเมื่อไหร่?"])(
    "«%s» asks when the money comes", (t) => expect(isPaydayQuestion(t)).toBe(true),
  );
  it.each(["เงินเข้าแล้ว", "รับเงิน 500", "วันนี้", "เมื่อไร", "ข้าว 45", "วันเกิดเมื่อไร", ""])(
    "«%s» is not", (t) => expect(isPaydayQuestion(t)).toBe(false),
  );
});

describe("isEnoughQuestion", () => {
  it.each(["เงินพอถึงวันเงินเข้าไหม", "พอถึงสิ้นเดือนไหม", "เงินจะพอไหม", "เงินพอใช้ไหมครับ", "เงินพอไหม", "เงินจะไหวถึงสิ้นเดือนมั้ย", "พอใช้ถึงวันเงินเข้าป่ะ"])(
    "«%s» asks if the money lasts", (t) => expect(isEnoughQuestion(t)).toBe(true),
  );
  it.each(["ถ้าซื้อข้าว 50 จะพอไหม", "ชาบู 300 พอไหม", "กินชาบูพอไหม", "พอ", "ไหวไหม", "พอใช้", "สวัสดี", ""])(
    "«%s» is not (an item or a price is a try, a bare word says nothing)", (t) => expect(isEnoughQuestion(t)).toBe(false),
  );
});

// 16 Nov: «พรุ่งนี้ใช้ได้เท่าไหร่» got «ตอบไม่ได้»
describe("isTomorrowQuestion", () => {
  it.each(["พรุ่งนี้ใช้ได้เท่าไหร่", "พรุ่งนี้ใช้ได้เท่าไร", "พรุ่งนี้ใช้เงินได้กี่บาท", "งบพรุ่งนี้เท่าไหร่ครับ", "พรุ่งนี้เหลือใช้เท่าไร"])(
    "«%s» asks tomorrow's budget", (t) => expect(isTomorrowQuestion(t)).toBe(true),
  );
  it.each(["พรุ่งนี้กินชาบู 300 ไหวไหม", "วันนี้ใช้ได้เท่าไหร่", "พรุ่งนี้เงินเข้าไหม", "พรุ่งนี้"])(
    "«%s» is not", (t) => expect(isTomorrowQuestion(t)).toBe(false),
  );
});

// Purchase shorthand must agree with the ledger parser, not read 10k as 10 baht.
it.each(["หูฟัง 10k ไหวไหม", "หูฟัง 10K ไหวไหม", "หูฟัง ๑๐k ไหวไหม", "หูฟัง １０ｋ ไหวไหม"])("reads thousand suffix in a trial: %s", input => {
  expect(readQuestion(input)).toMatchObject({ amount: 1000000, item: "หูฟัง" });
});
it.each(["หูฟัง 10kg ไหวไหม", "หูฟัง 1m ไหวไหม", "หูฟัง 1พัน ไหวไหม", "หูฟัง 10k มั้ง ไหวไหม"])("does not underread unclear units: %s", input => {
  expect(readQuestion(input).amount).toBeNull();
});

it.each(["ถ้าวันนี้ฉันได้รับเงิน 10k", "หากเงินเข้า 500", "ได้รับเงิน 500 ไหม"])("recognizes receipt questions: %s", input => {
  expect(isIncomeQuestion(input)).toBe(true);
});
it.each(["เงินเข้าเมื่อไร", "วันรับเงินวันไหน", "เงินพอถึงวันเงินเข้าไหม", "ได้รับเงิน 10k", "หูฟัง 10k ไหวไหม"])("does not replace another intent with hypothetical income: %s", input => {
  expect(isIncomeQuestion(input)).toBe(false);
});

it.each(["ถ้าวันนี้ได้รับเงิน −10k", "ถ้าวันนี้ได้รับเงิน - 10k", "ชาบู −100 ไหวไหม", "ชาบู - 100 ไหวไหม"])("a signed negative trial is never projected as positive: %s", input => {
  expect(readQuestion(input).amount).toBeNull();
});
