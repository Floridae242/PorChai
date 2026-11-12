import type { UserCategory } from "@/lib/api-types";

// Card 09: read a short chat message such as «ข้าว 50». Pure, so every rule is a unit test.
// Anything unclear is asked back, never guessed (no number words, no AI: "ไม่ขยายรองรับภาษาทุกแบบ").

export type AskReason = "no_amount" | "many_amounts" | "approximate" | "no_title" | "too_large";

export type ParsedExpense =
  | { kind: "entry"; title: string; amount: number; category: UserCategory }
  | { kind: "ask"; reason: AskReason };

export const MAX_AMOUNT = 10_000_000; // 100,000 baht: above this a typo is likelier than a spend
export const MAX_TITLE = 40; // fits a LINE postback with room to spare

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
// «ร้อยกว่า», «ประมาณ 50», «~50», «40-50»: the user does not know the exact amount yet
const APPROXIMATE = /กว่า|ประมาณ|ราว|เกือบ|~|\d\s*-\s*\d/;
const NUMBER = /\d+(?:\.\d{1,2})?/g;
const CURRENCY = /บาท|฿|\.-/g;

// First match wins, so the more specific words come before the words they contain
// (ค่าน้ำ before น้ำ, น้ำมัน before น้ำ)
const KEYWORDS: [UserCategory, string[]][] = [
  ["other", ["ค่าน้ำ", "ค่าไฟ", "ค่าเน็ต", "ค่าหอ", "ค่าโทร"]],
  [
    "transport",
    ["bts", "mrt", "รถ", "แท็กซี่", "taxi", "grab", "bolt", "วิน", "มอไซค์", "น้ำมัน", "เรือ", "ทางด่วน", "สองแถว"],
  ],
  [
    "supplies",
    ["ปากกา", "ดินสอ", "สมุด", "กระดาษ", "ปริ้น", "print", "ถ่ายเอกสาร", "เครื่องเขียน", "สบู่", "แชมพู", "ยาสีฟัน", "ทิชชู่", "ผงซักฟอก", "ของใช้"],
  ],
  [
    "food",
    ["ข้าว", "กาแฟ", "ชา", "น้ำ", "ขนม", "อาหาร", "เตี๋ยว", "หมู", "ไก่", "ชาบู", "ส้มตำ", "มื้อ", "นม", "ผลไม้", "ไอติม", "ไอศกรีม", "บุฟเฟ่ต์", "ปิ้งย่าง", "โกโก้", "สลัด", "ราเมง", "ซูชิ", "พิซซ่า"],
  ],
];

export function categoryOf(title: string): UserCategory {
  const t = title.toLowerCase();
  return KEYWORDS.find(([, words]) => words.some((w) => t.includes(w)))?.[0] ?? "other";
}

function clean(raw: string): string {
  return raw
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1") // 1,200 → 1200
    .replace(/^[\s/\\]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The answer to «ข้าว กี่บาท?»: only a bare amount («45», «45 บาท»), else null
export function amountOnly(raw: string): number | null {
  const text = clean(raw).replace(CURRENCY, "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Math.round(Number(text) * 100);
  return amount > 0 && amount <= MAX_AMOUNT ? amount : null;
}

export function parseExpense(raw: string): ParsedExpense {
  const text = clean(raw);

  if (APPROXIMATE.test(text)) return { kind: "ask", reason: "approximate" };
  const numbers = text.match(NUMBER) ?? [];
  if (numbers.length === 0) return { kind: "ask", reason: "no_amount" };
  if (numbers.length > 1) return { kind: "ask", reason: "many_amounts" };

  const amount = Math.round(Number(numbers[0]) * 100);
  if (amount <= 0) return { kind: "ask", reason: "no_amount" };
  if (amount > MAX_AMOUNT) return { kind: "ask", reason: "too_large" };

  const title = text.replace(NUMBER, " ").replace(CURRENCY, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
  if (!title) return { kind: "ask", reason: "no_title" };
  return { kind: "entry", title, amount, category: categoryOf(title) };
}
