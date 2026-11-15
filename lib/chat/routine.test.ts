import { describe, expect, it } from "vitest";
import { groundedReply, factsOf, type ChatFacts } from "./converse";
import { routineChat } from "./routine";

const facts: ChatFacts = { ...factsOf(null), setUp: true, state: "ok", balance: 2355, todayRemaining: 75, dailyBudget: 120, spentToday: 45, reserved: 600, daysLeft: 12 };
describe("regressions found by 54-case live Gemini evaluation", () => {
  it.each([
    "วันนี้ใช้ไป 45 บาทครับ เหลือเงินใช้ได้อีก 75 บาทต่อวันครับ",
    "วันนี้เหลือ 75 บาท/วัน",
    "งบต่อวันคือ 75 บาท",
    "งบเหลือ 2355 บาท",
    "วันนี้ใช้ได้อีก 9999 บาท",
    "งบวันละ ๗๕ บาท",
    "มีเงิน 75 บาท",
  ])("rejects a known number in the wrong financial role: %s", (text) => expect(groundedReply(text, facts)).toBe(false));
  it.each([
    "วันนี้ใช้ได้อีก 75 บาท งบต่อวันอยู่ที่ 120 บาท",
    "เงินทั้งหมดตอนนี้ 2,355 บาท วันนี้ใช้ไปแล้ว 45 บาท",
    "งบวันละ 120 บาท",
    "ข้าวราคาเท่าไรครับ",
  ])("keeps grounded wording: %s", (text) => expect(groundedReply(text, facts)).toBe(true));
  it.each(["ไง", "สวัสดีครับ", "Hi", ".", "555", "ขอบคุณนะ", "ฝันดี", "นายเป็นใคร", "ใช้ยังไง", "ทำอะไรได้บ้าง"])("routine intent needs no provider: %s", (text) => expect(routineChat(text)?.kind).toBe("chat"));
  it.each(["ข้าว", "กาแฟ", "ค่ารถ"])("asks for a price without inventing or saving: %s", (text) => expect(routineChat(text)).toEqual({ kind: "spend", item: text }));
  it.each(["ไม่ซื้อกาแฟ", "ข้าว 45", "ถ้ากินข้าวจะเหลือเท่าไร", "เมื่อวานข้าว", "โอนให้เพื่อน", "สวัสดีข้าว"])("does not expand exact routine matches into financial commands: %s", (text) => expect(routineChat(text)).toBeNull());
});
