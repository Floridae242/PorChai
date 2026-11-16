import { isQuestion } from "@/lib/advice/question";
import type { ProposedItem } from "@/lib/db/chat-memory";
import { conversationBoundary } from "./intent";
import { MAX_TITLE, parseExpense } from "./parse";

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const MAX_ITEMS = 5;

/** Mixed flows, totals, dates and quantities need clarification, not list extraction. */
export function canSplitExpenses(message: string): boolean {
  message = message.normalize("NFC").replace(/[๐-๙]/gu, d => String(THAI_DIGITS.indexOf(d)));
  if (/\d\s*(?:[eE][+-]?\d|[kKmM]\b|ล้าน|พัน|หมื่น|แสน|%|เปอร์เซ็นต์)|0[xX][\da-fA-F]|\btotal\b/u.test(message)) return false;
  return message.length <= 1000 && !conversationBoundary(message) && !isQuestion(message) &&
    !/รับเงิน|ได้รับ|รายรับ|เงินเข้า|ได้เงิน|เงินเดือน|แม่ให้เงิน|พ่อให้เงิน|(?:^|\s)รับ\s*\d|\b(?:income|salary|got paid)\b|เมื่อวาน|วานนี้|เมื่อคืน|พรุ่งนี้|มะรืน|เดือนหน้า|รวม|ทั้งหมด|หรือ|วันที่|ประมาณ|ราว|เกือบ|กว่า|~|[+\-/]|\d\s*(?:จาน|แก้ว|ชิ้น|กล่อง|ขวด|คน|ชุด|แพ็ก|แพ็ค|ครั้ง|ใบ|อัน|ตัว|ห่อ|ถุง|ซอง|คู่|เล่ม|ลูก|ฟอง|ไม้|ถ้วย|ชาม)|\d+\.\d{3}/iu.test(message) &&
    // «ข้าว 50 x2» was an item «x» of 2 baht (16 Nov): a multiplier needs asking
    !/(?:^|[\s\d])[xX×*]\s*\d|\d\s*[xX×*](?:\s|$)/u.test(message);
}

/** Each amount terminates exactly one named expense. No model, arithmetic or writes. */
export function splitExplicitExpenses(raw: string): ProposedItem[] | null {
  const message = raw.normalize("NFC")
    .replace(/[๐-๙]/gu, d => String(THAI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d{3}(?!\d))/gu, "$1").trim();
  if (!canSplitExpenses(message)) return null;
  const amounts = [...message.matchAll(/\d+(?:\.\d+)?\s*(?:บาท|฿)?/gu)];
  if (amounts.length < 2 || amounts.length > MAX_ITEMS) return null;
  const items: ProposedItem[] = [];
  let end = 0;
  for (const match of amounts) {
    const title = message.slice(end, match.index).trim()
      .replace(/^[\s,;、]+/u, "")
      .replace(/^(?:(?:แล้วก็|และ|กับ)\s*)/u, "")
      .replace(/^(?:ช่วยจด|จด|บันทึก|กิน|ซื้อ|จ่ายค่า)\s*/u, "")
      .replace(/\s*อีก\s*$/u, "").trim();
    if (!title || title.length > MAX_TITLE || /[\d.,;:฿]/u.test(title)) return null;
    const parsed = parseExpense(`${title} ${match[0]}`);
    if (parsed.kind !== "entry") return null;
    items.push({ title: parsed.title, amount: parsed.amount, category: parsed.category });
    end = match.index + match[0].length;
  }
  if (!/^(?:\s|[,;]|ครับ|คับ|ค่ะ|คะ|นะ|จ้า|แล้ว)*$/u.test(message.slice(end))) return null;
  return items;
}
