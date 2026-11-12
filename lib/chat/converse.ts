import type { Summary } from "@/lib/api-types";
import { FORBIDDEN, numbersIn, onlyKnownNumbers } from "@/lib/advice/question";
import { generate } from "@/lib/ai/gemini";
import { categoryOf, MAX_AMOUNT, MAX_TITLE } from "@/lib/chat/parse";
import type { ChatLine, ProposedItem } from "@/lib/db/chat-memory";

// Chat with the AI (card 15 "AI เข้าใจคำถาม"), used only when the rules cannot read a message:
// no amount («Hey», «ข้าว», «เหลือเท่าไร»), an approximate one («ข้าวร้อยกว่า») or several («ข้าว 45 น้ำ 20»).
// The AI reads and words; the code decides. It gets the message, the last 30 minutes of chat and the
// numbers below — no LINE id, name or list of spends. Anything it returns that breaks a guard is dropped
// and the caller answers with its template.

const MAX_REPLY = 400;
const MAX_ITEMS = 5;

export interface ChatFacts {
  setUp: boolean; // false = no cycle yet
  state: "ok" | "shortfall" | "payday-passed" | null;
  todayRemaining: number | null; // baht
  dailyBudget: number | null;
  spentToday: number | null;
  balance: number | null;
  reserved: number | null;
  daysLeft: number | null;
}

const baht = (satang: number) => Math.round(satang) / 100;

export function factsOf(s: Summary | null): ChatFacts {
  if (!s) {
    return { setUp: false, state: null, todayRemaining: null, dailyBudget: null, spentToday: null, balance: null, reserved: null, daysLeft: null };
  }
  const b = s.budget;
  return {
    setUp: true,
    state: b.kind,
    todayRemaining: b.kind === "ok" ? baht(b.todayRemaining) : null,
    dailyBudget: b.kind === "ok" ? baht(b.dailyBudget) : null,
    spentToday: baht(s.spentToday),
    balance: baht(s.balance),
    reserved: baht(s.reserved),
    daysLeft: b.kind === "payday-passed" ? null : b.daysLeft,
  };
}

// Every number a reply may write: the facts, and whatever the user typed in the chat
export function knownNumbers(f: ChatFacts, userTexts: string[]): number[] {
  const facts = [f.todayRemaining, f.dailyBudget, f.spentToday, f.balance, f.reserved, f.daysLeft];
  return [...facts.filter((n): n is number => n !== null), ...userTexts.flatMap(numbersIn)];
}

// Only the code saves: a reply that says it did would be a lie
const CLAIMS_SAVED = /จดแล้ว|จดให้แล้ว|บันทึกแล้ว|บันทึกให้แล้ว|เพิ่มแล้ว/;

export function replyOk(text: string, known: number[]): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= MAX_REPLY && onlyKnownNumbers(t, known) && !FORBIDDEN.test(t) && !CLAIMS_SAVED.test(t);
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

// The AI may shorten what the user wrote, never invent it
export function inText(item: string, text: string): boolean {
  const i = squash(item);
  return i.length > 0 && squash(text).includes(i);
}

// Several spends split by the AI. Each title must be in the message and each amount one the user typed
// (a number typed twice may be used twice). Any slip → null, and the bot asks for one at a time.
export function itemsFrom(ai: unknown, message: string): ProposedItem[] | null {
  const items = (ai as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null;
  const typed = numbersIn(message);
  const out: ProposedItem[] = [];
  for (const it of items as { title?: unknown; amount_baht?: unknown }[]) {
    if (typeof it?.title !== "string" || typeof it.amount_baht !== "number") return null;
    const title = it.title.trim().slice(0, MAX_TITLE);
    const at = typed.indexOf(it.amount_baht);
    const amount = Math.round(it.amount_baht * 100);
    if (!inText(title, message) || at === -1 || amount <= 0 || amount > MAX_AMOUNT) return null;
    typed.splice(at, 1);
    out.push({ title, amount, category: categoryOf(title) });
  }
  return out;
}

export async function splitItems(message: string): Promise<ProposedItem[] | null> {
  const raw = await generate({
    system:
      "แยกรายการรายจ่ายจากข้อความแชตของนักศึกษา ตอบเป็น JSON เท่านั้น แต่ละรายการ title = ชื่อสั้น ๆ ตามที่ผู้ใช้พิมพ์ " +
      "amount_baht = ตัวเลขที่ผู้ใช้พิมพ์สำหรับรายการนั้น ห้ามรวม คูณ หรือคำนวณเลขเอง",
    input: message,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, amount_baht: { type: "number" } },
            required: ["title", "amount_baht"],
          },
        },
      },
      required: ["items"],
    },
    maxOutputTokens: 200,
  });
  return itemsFrom(parse(raw), message);
}

// spend: «ข้าว» — the bot asks how much and remembers the item · chat: reply null = use the template ·
// off_topic: not about money or the app — the bot's own fixed answer, never the AI's words
export type Reading = { kind: "spend"; item: string } | { kind: "chat"; reply: string | null } | { kind: "off_topic" };

const TOPICS = ["money", "app", "greeting", "other"];

const SYSTEM =
  "คุณคือ 'พอใช้' ผู้ช่วยเรื่องเงินของนักศึกษาในแชต LINE อ่าน message (ข้อความล่าสุด) โดยดู history ประกอบ ตอบเป็น JSON " +
  "intent = spend ถ้าผู้ใช้บอกว่าจ่ายหรือซื้ออะไรไปแต่ไม่ได้บอกยอดเป็นตัวเลขชัด ๆ (item = ชื่อของสั้น ๆ ตามที่พิมพ์) " +
  "นอกนั้น intent = chat และเขียน reply: ภาษาไทย เป็นกันเอง ไม่เกิน 3 บรรทัด ไม่ใช้ markdown " +
  "topic = money (เงิน งบ รายจ่าย การซื้อ) · app (วิธีใช้แอปพอใช้) · greeting (ทักทาย ขอบคุณ) · other (เรื่องอื่นทั้งหมด เช่น การบ้าน สูตรอาหาร ข่าว การเมือง สุขภาพ ความรัก) " +
  "ถ้า topic = other ไม่ต้องตอบเนื้อหาเรื่องนั้นเลย ให้ reply เป็นค่าว่าง " +
  "ใช้ตัวเลขได้เฉพาะที่อยู่ใน facts (หน่วยบาท) หรือที่ผู้ใช้พิมพ์ ห้ามคำนวณหรือเขียนตัวเลขอื่น " +
  "ห้ามแนะนำให้ลดค่ากินหรือค่าเดินทาง ห้ามแนะนำใช้เงินออม ห้ามบอกว่าจดหรือบันทึกอะไรแล้ว " +
  "ถ้า facts.setUp เป็น false ให้ชวนตั้งรอบเงินในแอปก่อน ถ้าถามว่าซื้ออะไรไหวไหมแต่ไม่บอกราคา ให้ถามราคา " +
  "สิ่งที่ทำได้: จดรายจ่ายโดยพิมพ์ชื่อกับยอด เช่น ข้าว 45 · ถามก่อนจ่าย เช่น ชาบู 300 ไหวไหม · ดูสรุปและตั้งค่าในแอป";

export async function readChat(message: string, history: ChatLine[], facts: ChatFacts): Promise<Reading | null> {
  const raw = await generate({
    system: SYSTEM,
    input: JSON.stringify({ facts, history: history.map((l) => ({ role: l.role, text: l.body })), message }),
    schema: {
      type: "object",
      properties: {
        intent: { type: "string", enum: ["chat", "spend"] },
        topic: { type: "string", enum: TOPICS },
        item: { type: ["string", "null"] },
        reply: { type: "string" },
      },
      required: ["intent", "topic", "item", "reply"],
    },
    maxOutputTokens: 300,
  });
  const ai = parse(raw) as { intent?: unknown; topic?: unknown; item?: unknown; reply?: unknown } | null;
  if (!ai || (ai.intent !== "chat" && ai.intent !== "spend") || !TOPICS.includes(ai.topic as string)) return null;
  // Whatever it wrote about another subject is dropped, not filtered
  if (ai.topic === "other") return { kind: "off_topic" };

  if (ai.intent === "spend" && typeof ai.item === "string" && inText(ai.item, message)) {
    return { kind: "spend", item: ai.item.trim().slice(0, MAX_TITLE) };
  }
  const userTexts = [...history.filter((l) => l.role === "user").map((l) => l.body), message];
  const ok = ai.intent === "chat" && typeof ai.reply === "string" && replyOk(ai.reply, knownNumbers(facts, userTexts));
  return { kind: "chat", reply: ok ? (ai.reply as string).trim() : null };
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
