import { describe, expect, it } from "vitest";
import { amountOnly, parseExpense } from "@/lib/chat/parse";

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
    expect(parseExpense("ข้าวห้าสิบ")).toEqual({ kind: "ask", reason: "no_amount" }); // number words: not supported
  });

  it("more than one amount", () => {
    expect(parseExpense("ข้าว 50 น้ำ 20")).toEqual({ kind: "ask", reason: "many_amounts" });
  });

  it("an approximate amount such as «ร้อยกว่า», a range or ประมาณ", () => {
    for (const text of ["ข้าวร้อยกว่า", "ข้าว 100 กว่า", "ข้าว ประมาณ 50", "ข้าว ราว 50", "ข้าว ~50", "ข้าว 40-50", "ข้าวเกือบ 100"]) {
      expect(parseExpense(text)).toEqual({ kind: "ask", reason: "approximate" });
    }
  });

  it("an amount with no name", () => {
    expect(parseExpense("50")).toEqual({ kind: "ask", reason: "no_title" });
    expect(parseExpense("50 บาท")).toEqual({ kind: "ask", reason: "no_title" });
  });

  it("zero or an absurd amount", () => {
    expect(parseExpense("ข้าว 0")).toEqual({ kind: "ask", reason: "no_amount" });
    expect(parseExpense("ข้าว 99999999")).toEqual({ kind: "ask", reason: "too_large" });
  });

  it("keeps the name short enough for a LINE button", () => {
    const r = parseExpense(`${"ก".repeat(80)} 50`);
    expect(r).toMatchObject({ kind: "entry", amount: 5000 });
    expect((r as { title: string }).title.length).toBe(40);
  });
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
