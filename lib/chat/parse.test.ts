import { describe, expect, it } from "vitest";
import { amountOnly, categoryOf, parseExpense } from "@/lib/chat/parse";

it.each(["ได้รับเงิน 1000 บาท", "ได้รับเงิน ๑,๐๐๐ บาท", "แม่ให้เงิน 1000", "พ่อให้เงิน 1000", "got paid 1000", "income 1000"])("explicit received money is income, never an expense: %s", (message) => {
  expect(parseExpense(message)).toMatchObject({ kind: "income", amount: 100000 });
});
it.each(["จะได้รับเงิน 1000", "รอเงินเข้า 1000", "แม่ให้เงินพรุ่งนี้ 1000", "ได้รับเงินคืน 1000"])("future or refund money is not silently booked: %s", (message) => {
  expect(parseExpense(message).kind).toBe("ask");
});

// Card 09: a short message such as «ข้าว 50» becomes a name and an amount; anything unclear is asked, never guessed.

describe("parseExpense — clear messages are recorded", () => {
  it("«ข้าว 50» → food 50 baht", () => {
    expect(parseExpense("ข้าว 50")).toEqual({ kind: "entry", title: "ข้าว", amount: 5000, category: "food" });
  });

  it("the amount may come first, carry บาท / ฿ / .- , satang or Thai digits", () => {
    expect(parseExpense("45 ข้าวมันไก่")).toMatchObject({ title: "ข้าวมันไก่", amount: 4500 });
    expect(parseExpense("กาแฟ 55 บาท")).toMatchObject({ title: "กาแฟ", amount: 5500 });
    expect(parseExpense("กาแฟ ฿55")).toMatchObject({ amount: 5500 });
    expect(parseExpense("กาแฟ 55.-")).toMatchObject({ amount: 5500 });
    expect(parseExpense("ขนม 12.50")).toMatchObject({ amount: 1250 });
    expect(parseExpense("ข้าว ๔๕")).toMatchObject({ amount: 4500 });
    expect(parseExpense("หูฟัง 1,200")).toMatchObject({ title: "หูฟัง", amount: 120000 });
  });

  it("ignores leading slashes and extra spaces (as typed in the real chat: «/ ข้าว 50»)", () => {
    expect(parseExpense("/\nข้าว   50 ")).toMatchObject({ title: "ข้าว", amount: 5000 });
  });

  it("category from simple keywords; anything else is 'other'", () => {
    expect(parseExpense("ชาบู 350")).toMatchObject({ category: "food" });
    expect(parseExpense("BTS 47")).toMatchObject({ category: "transport" });
    expect(parseExpense("วินมอไซค์ 20")).toMatchObject({ category: "transport" });
    expect(parseExpense("น้ำมัน 200")).toMatchObject({ category: "transport" });
    expect(parseExpense("น้ำ 10")).toMatchObject({ category: "food" });
    expect(parseExpense("ปริ้นงาน 15")).toMatchObject({ category: "supplies" });
    expect(parseExpense("สบู่ 39")).toMatchObject({ category: "supplies" });
    expect(parseExpense("ค่าน้ำ 150")).toMatchObject({ category: "other" });
    expect(parseExpense("ตั๋วหนัง 200")).toMatchObject({ category: "other" });
  });
});

describe("parseExpense — unclear messages are asked, never recorded", () => {
  it("no amount", () => {
    expect(parseExpense("ข้าว")).toEqual({ kind: "ask", reason: "no_amount" });
    expect(parseExpense("Hey")).toEqual({ kind: "ask", reason: "no_amount" });
    expect(parseExpense("ข้าวห้าสิบ")).toEqual({ kind: "ask", reason: "number_word" }); // number words: asked in digits (16 Nov)
  });

  it("more than one amount", () => {
    expect(parseExpense("ข้าว 50 น้ำ 20")).toEqual({ kind: "ask", reason: "many_amounts" });
  });

  it("an approximate amount such as «ร้อยกว่า», a range or ประมาณ", () => {
    for (const text of ["ข้าวร้อยกว่า", "ข้าว 100 กว่า", "ข้าว ประมาณ 50", "ข้าว ราว 50", "ข้าว ~50", "ข้าว 40-50", "ข้าวเกือบ 100"]) {
      expect(parseExpense(text)).toEqual({ kind: "ask", reason: "approximate" });
    }
  });

  it("money in is income, never a spend: «รับ 500» (โฟรวิว's how-to card)", () => {
    expect(parseExpense("รับ 500")).toEqual({ kind: "income", amount: 50000, note: null });
    expect(parseExpense("รับเงิน 1,200 จากแม่")).toEqual({ kind: "income", amount: 120000, note: "จากแม่" });
    for (const t of ["เงินเข้า 1000", "ได้เงิน 300", "รายรับ 200", "เงินเดือน 5000"]) expect(parseExpense(t).kind, t).toBe("income");
  });

  it("income that is not clear is asked, like a spend", () => {
    expect(parseExpense("รับ")).toEqual({ kind: "ask", reason: "income" });
    expect(parseExpense("รับ 500 และ 300")).toEqual({ kind: "ask", reason: "many_amounts" });
    expect(parseExpense("ได้เงินประมาณ 500")).toEqual({ kind: "ask", reason: "approximate" });
  });

  it("another day is asked back, never recorded as today (income too)", () => {
    for (const t of ["เมื่อวาน ข้าว 45", "ข้าว 45 เมื่อวาน", "เมื่อคืน ชาบู 300", "วานนี้ กาแฟ 40", "รับ 500 เมื่อวาน"]) {
      expect(parseExpense(t), t).toEqual({ kind: "ask", reason: "backdated" });
    }
  });

  it("names that only contain those words are still spends", () => {
    for (const t of ["ค่ารับส่ง 50", "ข้าวมื้อเย็น 60", "ของขวัญวันเกิด 300"]) expect(parseExpense(t).kind, t).toBe("entry");
  });

  it("an amount with no name", () => {
    expect(parseExpense("50")).toEqual({ kind: "ask", reason: "no_title" });
    expect(parseExpense("50 บาท")).toEqual({ kind: "ask", reason: "no_title" });
  });

  it("zero or an absurd amount", () => {
    expect(parseExpense("ข้าว 0")).toEqual({ kind: "ask", reason: "invalid_amount" });
    expect(parseExpense("ข้าว 99999999")).toEqual({ kind: "ask", reason: "too_large" });
  });

  it("keeps the name short enough for a LINE button", () => {
    const r = parseExpense(`${"ก".repeat(80)} 50`);
    expect(r).toMatchObject({ kind: "entry", amount: 5000 });
    expect((r as { title: string }).title.length).toBe(40);
  });
});

it.each(["ข้าว -10", "ข้าว −10", "ข้าว - ๑๐", "ข้าว +10", "ข้าว 10.999", "รับ -10", "รับ 0"])("never drops an invalid amount sign or precision: %s", (message) => {
  expect(parseExpense(message)).toEqual({ kind: "ask", reason: "invalid_amount" });
});

describe("amountOnly: the answer to «กี่บาท?»", () => {
  it("a bare amount, with or without บาท, Thai digits or a comma", () => {
    expect(amountOnly("45")).toBe(4500);
    expect(amountOnly(" 45 บาท ")).toBe(4500);
    expect(amountOnly("๔๕")).toBe(4500);
    expect(amountOnly("1,200฿")).toBe(120000);
    expect(amountOnly("12.50")).toBe(1250);
  });

  it("anything else is not an answer", () => {
    for (const text of ["ข้าว 45", "45 50", "ประมาณ 45", "0", "99999999", "Hey", ""]) expect(amountOnly(text)).toBeNull();
  });
});

// 15 Nov: «ปลาหมึกย่าง» went to «อื่น ๆ»
it.each(["ปลาหมึกย่าง", "กุ้งเผา", "หมาล่า", "ผัดกะเพรา", "ไข่เจียว", "ต้มยำ", "ลูกชิ้นทอด", "แกงเขียวหวาน", "โจ๊ก", "บะหมี่", "เบอร์เกอร์", "ชานมไข่มุก", "บิงซู", "โรตี", "สเต็ก", "ติ่มซำ"])(
  "«%s» is food", (title) => expect(categoryOf(title)).toBe("food"),
);
it("«อย่าง» is not «ย่าง»: «อย่างอื่น» stays other", () => expect(categoryOf("อย่างอื่น")).toBe("other"));

// 16 Nov: «กิน ปลาหมึก 60 กับ หม่าล่าไป 50» gave «หม่าล่าไป · อื่น ๆ»
it.each([
  ["หม่าล่าไป 50", "หม่าล่า"],
  ["ข้าวจ่ายไป 45", "ข้าว"],
  ["ค่ารถหมดไป 30", "ค่ารถ"],
  ["กาแฟใช้ไป 60 บาท", "กาแฟ"],
  ["ข้าว ไป 45", "ข้าว"],
])("«%s»: the name is «%s», without the trailing «ไป»", (text, title) => {
  expect(parseExpense(text)).toMatchObject({ kind: "entry", title });
});
it("«จ่ายไป 50» has no name left: asked what it was for", () => {
  expect(parseExpense("จ่ายไป 50")).toEqual({ kind: "ask", reason: "no_title" });
});
it("«ไปรษณีย์ 30» keeps its name: only a trailing «ไป» goes", () => {
  expect(parseExpense("ไปรษณีย์ 30")).toMatchObject({ kind: "entry", title: "ไปรษณีย์" });
});
it.each(["หม่าล่า", "หมาล่า"])("«%s» is food, however it is spelt", (title) => expect(categoryOf(title)).toBe("food"));

// 16 Nov: «ข้าว 1k» was recorded as 1 baht named «ข้าว k»
it.each([
  ["ข้าว 1k", "ข้าว", 100000],
  ["ข้าว 1.5k", "ข้าว", 150000],
  ["ค่าหอ 3K บาท", "ค่าหอ", 300000],
  ["ข้าว 2 k", "ข้าว", 200000],
])("«%s» is a thousand: «%s» %i satang", (text, title, amount) => {
  expect(parseExpense(text)).toMatchObject({ kind: "entry", title, amount });
});
it("«kfc 99» keeps its name: «k» is a thousand only after a number", () => {
  expect(parseExpense("kfc 99")).toMatchObject({ kind: "entry", title: "kfc", amount: 9900 });
});
it("«ข้าวสาร 5kg» is not 5,000 baht: «kg» is a weight", () => {
  expect(parseExpense("ข้าวสาร 5kg")).not.toMatchObject({ amount: 500000 });
});
it("«200k» is too large, asked back", () => {
  expect(parseExpense("ข้าว 200k")).toEqual({ kind: "ask", reason: "too_large" });
});

// 16 Nov: «กาแฟ 45 บาทค่ะ» was named «กาแฟ ค่ะ»
it.each([
  ["กาแฟ 45 บาทค่ะ", "กาแฟ"],
  ["ข้าว 50 ครับ ขอบคุณ", "ข้าว"],
  ["ข้าว 50 นะครับ", "ข้าว"],
  ["ชานม 45 จ้า", "ชานม"],
  ["ข้าวมันไก่ 45 ขอบคุณครับ", "ข้าวมันไก่"],
  ["หม่าล่าไป 50 ครับ", "หม่าล่า"],
])("«%s»: the name is «%s», without the polite ending", (text, title) => {
  expect(parseExpense(text)).toMatchObject({ kind: "entry", title });
});
it("«ครับ 50» alone has no name left", () => {
  expect(parseExpense("ครับ 50")).toEqual({ kind: "ask", reason: "no_title" });
});
it("a word that only ends like «นะ» keeps it when written together", () => {
  expect(parseExpense("ขนมนะ 20")).toMatchObject({ title: "ขนมนะ" });
});

// 16 Nov: «ค่า 50», «ซื้อ 50» were recorded named «ค่า», «ซื้อ»; «7-11 85» was asked as a range
it.each(["ค่า 50", "ซื้อ 50", "จ่าย 50", "ค่าใช้จ่าย 50", "รายจ่าย 50"])("«%s» has no name: asked what for", (text) => {
  expect(parseExpense(text)).toEqual({ kind: "ask", reason: "no_title" });
});
it.each(["7-11 85", "7-eleven 85", "เซเว่น 85"])("«%s» is the shop, 85 baht", (text) => {
  expect(parseExpense(text)).toMatchObject({ kind: "entry", title: "เซเว่น", amount: 8500 });
});
it("«ข้าว 40-50» is still a range", () => {
  expect(parseExpense("ข้าว 40-50")).toEqual({ kind: "ask", reason: "approximate" });
});
