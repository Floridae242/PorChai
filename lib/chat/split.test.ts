import { describe, expect, it } from "vitest";
import { splitLine } from "@/lib/chat/split";

// 15 Nov: «กินปลาหมึกย่าง 70 บาท น้ำส้มอีก 30 บาท ซูชิอีก 30 บาท» got «ส่งทีละรายการ» when Gemini failed.
// A plain «name amount, name amount» line is split by rule (no AI); anything less clear is left to the AI.

describe("splitLine", () => {
  it("the message from 15 Nov: three items, «กิน» and «อีก» are not part of the names", () => {
    expect(splitLine("กินปลาหมึกย่าง 70 บาท น้ำส้มอีก 30 บาท ซูชิอีก 30 บาท")).toEqual([
      { title: "ปลาหมึกย่าง", amount: 7000, category: "food" },
      { title: "น้ำส้ม", amount: 3000, category: "food" },
      { title: "ซูชิ", amount: 3000, category: "food" },
    ]);
  });

  it.each([
    ["ข้าว 50 น้ำ 20", [["ข้าว", 5000], ["น้ำ", 2000]]],
    ["ข้าว 45, กาแฟ 60", [["ข้าว", 4500], ["กาแฟ", 6000]]],
    ["ข้าว 45 กับ ชาเย็น 25", [["ข้าว", 4500], ["ชาเย็น", 2500]]],
    ["ข้าว 45 และขนม 20 บาท", [["ข้าว", 4500], ["ขนม", 2000]]],
    ["ค่ารถ 30 บาท ข้าว 1,200 บาท", [["ค่ารถ", 3000], ["ข้าว", 120000]]],
    ["ข้าว ๕๐ น้ำ ๒๐", [["ข้าว", 5000], ["น้ำ", 2000]]],
    ["ข้าว 45.50 + น้ำ 20", [["ข้าว", 4550], ["น้ำ", 2000]]],
    ["ข้าว 50 น้ำ 20 ครับ", [["ข้าว", 5000], ["น้ำ", 2000]]],
  ])("«%s»", (text, items) => {
    expect(splitLine(text)?.map((i) => [i.title, i.amount])).toEqual(items);
  });

  it.each([
    "ข้าว 2 จาน 100", // a count, not two prices
    "ชาบู 2 คน 600",
    "กาแฟ 3 แก้ว 150 บาท",
    "ชาบู 150 หรือ 200 ดี", // a choice
    "ข้าว 50 น้ำ 20 ไหวไหม", // a question
    "ข้าว 50 น้ำ 20 พรุ่งนี้",
    "เมื่อวาน ข้าว 50 น้ำ 20", // another day
    "ข้าวประมาณ 50 น้ำ 20", // not exact
    "รับ 500 ข้าว 50", // money in
    "ข้าว 50 น้ำ", // a name without its amount
    "50 20", // amounts without names
    "ข้าว 50 และ 20",
    "ข้าว 50 น้ำ 0",
    "ไม่ได้ซื้อข้าว 50 น้ำ 20", // said it was not bought
    "a 1 b 2 c 3 d 4 e 5 f 6", // more than 5 items
    "ข้าว 50",
    "",
  ])("«%s» is left to the AI (or asked)", (text) => {
    expect(splitLine(text)).toBeNull();
  });
});
