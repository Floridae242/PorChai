import { describe, expect, it } from "vitest";
import { onlyKnownNumbers } from "@/lib/advice/question";
import { groundedReply, type ChatFacts } from "./converse";

const facts: ChatFacts = { setUp: true, state: "ok", todayRemaining: 75, dailyBudget: 120, spentToday: 45, balance: 2355, reserved: 600, daysLeft: 12 };
const digits = [
  (s: string) => s,
  (s: string) => s.replace(/\d/g, (d) => "๐๑๒๓๔๕๖๗๘๙"[Number(d)]),
  (s: string) => s.replace(/\d/g, (d) => "０１２３４５６７８９"[Number(d)]),
];
const roles = [
  ["วันนี้ใช้ได้อีก", 75], ["งบต่อวัน", 120], ["ใช้ไปแล้ว", 45], ["เงินทั้งหมด", 2355],
] as const;
const matrix = roles.flatMap(([label, expected]) => [75, 120, 45, 2355].flatMap((value) => digits.map((encode) => ({ text: `${label} ${encode(String(value))} บาท`, valid: value === expected }))));

describe("known-number role permutation matrix", () => {
  it.each(matrix)("$text -> grounded=$valid", ({ text, valid }) => {
    expect(onlyKnownNumbers(text, [75, 120, 45, 2355])).toBe(true);
    expect(groundedReply(text, facts)).toBe(valid);
  });
  it.each(["75/วัน", "75 บาท/วัน", "75บ./วัน", "75฿/วัน", "75 บาท ต่อ วัน", "๗๕/วัน", "７５／วัน"])("rejects a remaining-today amount with alternate daily unit: %s", (text) => {
    expect(groundedReply(text, facts)).toBe(false);
  });
  it.each(["120/วัน", "120 บาท/วัน", "120บ./วัน", "120฿/วัน", "120 บาท ต่อ วัน", "๑๒๐/วัน", "１２０／วัน"])("keeps the real daily budget with alternate unit: %s", (text) => {
    expect(groundedReply(text, facts)).toBe(true);
  });
  it.each(["วันนี้ใช้ได้อีก 75 บาท", "งบต่อวัน 120 บาท", "เงินทั้งหมด 2355 บาท", "ใช้ไปแล้ว 45 บาท"])("cannot make financial claims before setup: %s", (text) => {
    expect(groundedReply(text, { ...facts, setUp: false, todayRemaining: null, dailyBudget: null, balance: null, spentToday: null })).toBe(false);
  });
  it("retains the sign of an over-budget amount", () => {
    const over = { ...facts, todayRemaining: -25 };
    expect(groundedReply("วันนี้ใช้ได้อีก -25 บาท", over)).toBe(true);
    expect(groundedReply("วันนี้ใช้ได้อีก 25 บาท", over)).toBe(false);
  });
  it("does not substitute a rounded daily amount for quarter-baht precision", () => {
    const quarter = { ...facts, dailyBudget: 120.25 };
    expect(groundedReply("งบต่อวัน ๑๒๐.๒๕ บาท", quarter)).toBe(true);
    expect(groundedReply("งบต่อวัน 120 บาท", quarter)).toBe(false);
  });
  it("one correct sentence cannot hide a second incorrect financial role", () => {
    expect(groundedReply("วันนี้ใช้ได้อีก 75 บาท\nงบต่อวัน 75 บาท", facts)).toBe(false);
    expect(groundedReply("วันนี้ใช้ได้อีก 75 บาท\nงบต่อวัน 120 บาท", facts)).toBe(true);
  });
});
