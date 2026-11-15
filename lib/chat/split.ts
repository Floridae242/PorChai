import { conversationBoundary } from "@/lib/chat/intent";
import { parseExpense } from "@/lib/chat/parse";
import type { ProposedItem } from "@/lib/db/chat-memory";

// «กินปลาหมึกย่าง 70 บาท น้ำส้มอีก 30 บาท ซูชิอีก 30 บาท» (15 Nov, the AI was down): a plain line of
// «name amount» pairs is split here, without the AI. Anything less clear returns null and the AI reads it.
// Still only a proposal: nothing is recorded until [จดทั้งหมด].
const MAX_ITEMS = 5;
const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
// One pair: a name, its amount, then «บาท» if typed. Sticky, so the whole line must be pairs
const PAIR = /([^\d]+?)\s*(\d+(?:\.\d{1,2})?)\s*(?:บาท|฿|\.-)?\s*/y;
const JOINER = /^[\s,，+&/]*(?:แล้วก็|และ|กับ|อีก)?\s*/;
const TRAILER = /\s*(?:อีก|ด้วย)$/;
const VERB = /^(?:กิน|ดื่ม|ซื้อ)\s*/;
// «ข้าว 2 จาน 100»: the number before a unit is a count, not a price
const UNIT = /^(?:จาน|แก้ว|ชิ้น|อัน|คน|ถุง|กล่อง|ขวด|ห่อ|ลูก|ตัว|ไม้|ชาม|ถ้วย|ที่|ชุด|เล่ม|ครั้ง|รอบ|วัน)$/;

export function splitLine(raw: string): ProposedItem[] | null {
  const text = raw
    .replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .replace(/(?:\s*(?:ครับ|คับ|ค่ะ|คะ|นะ|จ้า))+\s*$/u, "")
    .trim();
  if (!text || conversationBoundary(text)) return null;

  const items: ProposedItem[] = [];
  PAIR.lastIndex = 0;
  while (PAIR.lastIndex < text.length) {
    const m = PAIR.exec(text);
    if (!m) return null; // something that is not a pair (a question, a date, a name without its amount)
    let name = m[1].replace(JOINER, "").replace(TRAILER, "").trim();
    if (VERB.test(name) && name.replace(VERB, "")) name = name.replace(VERB, "");
    if (!name || UNIT.test(name)) return null;
    const one = parseExpense(`${name} ${m[2]}`); // the same rules as one item: not income, not another day, exact
    if (one.kind !== "entry") return null;
    items.push({ title: one.title, amount: one.amount, category: one.category });
    if (items.length > MAX_ITEMS) return null;
  }
  return items.length >= 2 ? items : null;
}
