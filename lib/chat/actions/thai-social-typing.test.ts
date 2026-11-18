import { describe, expect, it } from "vitest";
import { commandText, fields, parseIntent, statedMoney } from "./parse";
import { parseExpense } from "@/lib/chat/parse";

// Hand-authored PorChai fixtures inspired by linguistic categories, not copied user messages.
// Sources and conservative financial expectations: docs/THAI-CHAT-RESEARCH.md.
const today = "2026-11-18";
describe("Thai informal particles and word-final elongation", () => {
  it.each(["คับ", "คับบบ", "ครับบบบ", "ค้าบ", "ค้าบบบ", "คร้าบบบ", "ค่าาา", "จ้าาา", "น้าาา", "งับ", "นะคับ"]
    .flatMap(ending => [
      { input: `ดูแต้ม${ending}`, tool: "points" },
      { input: `ดูรายงานวันนี้หน่อย${ending}`, tool: "report" },
      { input: `สร้างบิลเน็ต399บาททุกวันที่25ของเดือน${ending}`, tool: "add_bill" },
    ]))("$input → $tool", ({ input, tool }) => {
      const intent = parseIntent(input, today);
      expect(intent?.tool).toBe(tool);
      if (tool === "add_bill") expect(intent).toMatchObject({ title: "เน็ต", amount: 39900, date: "2026-11-25", repeat: "monthly" });
    });
});
it.each(["ดูแต้ม pls", "ดูแต้ม please", "ดูแต้ม plz", "ดูแต้ม thx"])("supports bounded English polite tails: %s", input => {
  expect(parseIntent(input, today)?.tool).toBe("points");
});
it.each(["399", "555", "1111", "111.11", "๕๕๕", "５５５"])("never collapses repeated digits during command framing: %s", input => {
  expect(commandText(input)).toBe(input);
  expect(statedMoney(commandText(input))).toBe(statedMoney(input));
});
it.each(["ยืนยันไหม", "ยืนยันป่าว", "ยังไม่ยืนยัน", "ไม่เอาคับ", "โอเค", "ok", "เค", "ได้ๆ", "👍", "555"])("never rewrites questions, acknowledgements or negation into an affirmative: %s", input => {
  expect(commandText(input)).not.toMatch(/^(ยืนยัน|ตกลง|ใช่)$/u);
});
it.each(["ข้าว 50 555", "กาแฟห้าสิบกว่า", "ข้าว 50-60", "เงินเข้า 1 หมื่นมั้ง", "เงินเข้า 1 หมื่น", "ค่าเช่า 2 พัน", "รับเงิน 3 แสน", "เงินเข้า 1m"])("does not book an unclear colloquial amount: %s", input => {
  expect(parseExpense(input).kind).not.toBe("entry");
  expect(parseExpense(input).kind).not.toBe("income");
});
it.each(["1 หมื่น", "2พัน", "3 แสน", "1ล้าน", "399มั้ง", "1k", "1m"])("a pending command cannot misread mixed units as their leading number: %s", input => {
  expect(statedMoney(input)).toBeUndefined();
});
it("preserves the existing explicit k shorthand for a new expense", () => {
  expect(parseExpense("ค่ารถ 1k")).toMatchObject({ kind: "entry", amount: 100000 });
});
it.each(["1 พัน", "1k", "1e3", "50-60", "50 - 60", "50 มั้ง", "e50", "50e", "50.."])("named daily budgets cannot discard uncertain units: %s", amount => {
  expect(fields(`ตั้งค่าอาหาร ${amount} ค่าเดินทาง 20`, "essentials", today).food).toBeUndefined();
});
it("still parses two exact named daily budgets including grouping commas", () => {
  expect(fields("ตั้งค่าอาหาร 1,000 ค่าเดินทาง 20", "essentials", today))
    .toMatchObject({ food: 100000, transport: 2000 });
});
it("does not normalize inside Thai names or collapse their repeated consonants", () => {
  expect(commandText("สร้างบิลค่าน้ำร้านนนท์399บาททุกวันที่25"))
    .toBe("สร้างบิลค่าน้ำร้านนนท์399บาททุกวันที่25");
});
