import type { Summary, SimulateResponse } from "@/lib/api-types";
import type { Advice } from "@/lib/advice/advise";
import type { AskReason } from "@/lib/chat/parse";
import type { BudgetResult } from "@/lib/calc/budget";
import type { ProposedItem } from "@/lib/db/chat-memory";
import { formatBaht } from "@/lib/format/money";
import { appUrl } from "@/lib/liff/config";
import { text, type QuickReplyAction, type TextMessage } from "@/lib/line/reply";

// What the bot says (card 09 / Figma L2, L6). Plain text for now; card 10 adds the edit buttons.

// Getters: the app's URL depends on runtime env (LIFF or MINI App)
const app = (label = "เปิดแอป"): QuickReplyAction => ({ type: "uri", label, uri: appUrl() });

const CATEGORY = { food: "อาหาร", transport: "เดินทาง", supplies: "ของใช้", other: "อื่น ๆ", bills: "บิล" } as const;

// Same as the screens: 1,440 · 61.50 (two decimals only when there are satang, R3-quarter)
export const baht = (satang: number) => formatBaht(Math.round(satang));

export interface Draft {
  title: string;
  amount: number;
  category: keyof typeof CATEGORY;
  key: string; // the first message's webhookEventId: the spend is saved once under it
  dueOn?: string | null; // card 15: a question about tomorrow keeps a plan due then
}

// Postback data the confirm / try buttons carry back (LINE allows 300 characters)
export const draftData = (action: "pay" | "try" | "keep", d: Draft) =>
  JSON.stringify({ a: action, t: d.title, m: d.amount, c: d.category, k: d.key, ...(d.dueOn && { d: d.dueOn }) });

const payButton = (d: Draft): QuickReplyAction => ({
  type: "postback",
  label: "ยืนยันจ่ายจริง",
  data: draftData("pay", d),
  displayText: "ยืนยันจ่ายจริง",
});

const ASK: Record<AskReason, string> = {
  no_amount: "จดรายจ่าย พิมพ์ชื่อกับยอดได้เลย เช่น «ข้าว 45» หรือกรอกเองในแอป",
  many_amounts: "เจอหลายยอดในข้อความเดียว ส่งทีละรายการนะ เช่น «ข้าว 50» แล้วค่อย «น้ำ 20»",
  approximate: "ขอยอดที่จ่ายจริงเป็นตัวเลขนะ เช่น «ข้าว 120» จะได้จดไม่ผิด",
  no_title: "ยอดนี้ค่าอะไร? พิมพ์ชื่อด้วย เช่น «ข้าว 50»",
  too_large: "ยอดนี้สูงมาก ถ้าถูกต้องกรอกเองในแอปได้เลย",
};

export const askMessage = (reason: AskReason): TextMessage => text(ASK[reason], [app("กรอกเองในแอป")]);

export const noCycleMessage = (): TextMessage => text("ยังไม่ได้ตั้งรอบเงิน ตั้งค่าในแอปก่อนเริ่มจดนะ", [app()]);

const line = (d: Pick<Draft, "title" | "amount" | "category">) =>
  `${d.title} ${baht(d.amount)} บาท (${CATEGORY[d.category]})`;

function budgetLine(b: BudgetResult, spentToday: number): string {
  if (b.kind === "payday-passed") return "ถึงวันเงินเข้าแล้ว เงินเข้าหรือยัง? ตั้งรอบใหม่ในแอปได้เลย";
  if (b.kind === "shortfall") return `ตอนนี้เงินไม่พอสำหรับบิล ออม และเงินเผื่อ ขาด ${baht(b.shortfall)} บาท`;
  if (b.todayRemaining < 0) return `เกินงบวันนี้ ${baht(-b.todayRemaining)} บาท (งบวันนี้ ${baht(b.dailyBudget)})`;
  return `วันนี้ใช้ได้อีก ${baht(b.todayRemaining)} บาท · ใช้ไปแล้ว ${baht(spentToday)} / ${baht(b.dailyBudget)}`;
}

// L2 / L6 after "ยืนยันจ่ายจริง"
export function recordedMessage(d: Draft, s: Summary, tomorrow: BudgetResult): TextMessage {
  return text([`จดแล้ว ✓ ${line(d)}`, ...afterRecording(s, tomorrow)].join("\n"), [app()]);
}

// Several at once from [จดทั้งหมด]
export function recordedManyMessage(items: ProposedItem[], s: Summary, tomorrow: BudgetResult): TextMessage {
  return text([`จดแล้ว ✓ ${items.length} รายการ`, ...items.map((i) => `• ${line(i)}`), ...afterRecording(s, tomorrow)].join("\n"), [app()]);
}

function afterRecording(s: Summary, tomorrow: BudgetResult): string[] {
  const b = s.budget;
  const lines = [budgetLine(b, s.spentToday)];
  // Once today is over budget, also how much tomorrow gets: the overspend comes off the days that are left
  const over = b.kind === "ok" && b.todayRemaining < 0 && tomorrow.kind === "ok";
  if (over) lines.push(`พรุ่งนี้ใช้ได้ ${baht(tomorrow.dailyBudget)} บาท/วัน (เดิม ${baht(b.dailyBudget)})`);
  const tail = cheer(b, over);
  if (tail) lines.push(tail);
  return lines;
}

// A friendly last line (no AI, no numbers): how today is going
function cheer(b: BudgetResult, overWithTomorrow: boolean): string | null {
  if (b.kind !== "ok") return null;
  if (b.todayRemaining < 0) return overWithTomorrow ? "ไม่เป็นไรครับ งบพรุ่งนี้ปรับให้แล้ว" : null;
  if (b.todayRemaining === 0) return "พอดีงบวันนี้เป๊ะเลยครับ";
  if (b.todayRemaining * 2 >= b.dailyBudget) return "ยังเหลืออีกเยอะ ใช้ได้สบาย ๆ ครับ";
  return "เหลือไม่มากแล้ว ค่อย ๆ ใช้นะครับ";
}

// L6: over what is left today — held until the user says it was really paid
export const holdMessage = (d: Draft, todayRemaining: number): TextMessage =>
  text(`${baht(d.amount)} บาท สูงกว่างบที่เหลือวันนี้ (${baht(todayRemaining)} บาท)\nจ่ายไปแล้ว หรืออยากลองก่อนซื้อ?`, [
    payButton(d),
    { type: "postback", label: "ลองก่อนซื้อ", data: draftData("try", d), displayText: "ลองก่อนซื้อ" },
  ]);

export const alreadyMessage = (d: Draft): TextMessage => text(`รายการนี้จดไว้แล้ว ✓ ${line(d)}`, [app()]);

// L6 "ลองก่อนซื้อ": the card 14 try, nothing saved
export function tryMessage(d: Draft, r: SimulateResponse): TextMessage {
  if (r.verdict === "ask") {
    const why = r.needs.includes("payday") ? "ถึงวันเงินเข้าแล้ว ตั้งรอบใหม่ก่อน" : "ยังไม่รู้ค่ากินค่ารถต่อวัน ตั้งในแอปก่อนนะ";
    return text(`ลองก่อนซื้อ: ${line(d)}\n${why}`, [app()]);
  }
  const lines = [`ลองก่อนซื้อ: ${line(d)}`];
  if (r.before?.kind === "ok") lines.push(`ไม่ซื้อ → วันละ ${baht(r.before.dailyBudget)} บาท`);
  if (r.after?.kind === "ok") lines.push(`ซื้อ → เหลือวันละ ${baht(r.after.dailyBudget)} บาท`);
  if (r.verdict === "ok") lines.push("ค่ากินค่ารถยังพอทุกวัน");
  if (r.verdict === "essentials_short" && r.after?.kind === "ok") {
    lines.push(`ค่ากินค่ารถไม่พอ ขาดวันละ ${baht(r.after.essentialShortPerDay ?? 0)} บาท`);
  }
  if (r.verdict === "shortfall" && r.after?.kind === "shortfall") lines.push(`เงินไม่พอ ขาด ${baht(r.after.shortfall)} บาท`);
  lines.push("ออมและเงินเผื่อไม่ถูกแตะ");
  return text(lines.join("\n"), [payButton(d), app()]);
}

const keepButton = (d: Draft): QuickReplyAction => ({
  type: "postback",
  label: "เก็บไว้ในแผน",
  data: draftData("keep", d),
  displayText: "เก็บไว้ในแผน",
});

// Card 15: the answer first, confirming is a button (today: pay or keep; another day: keep)
export function adviceMessage(a: Advice, key: string): TextMessage {
  if (a.verdict === "ask" || a.amount === null) return text(a.explanation, [app()]);
  const d: Draft = { title: a.item ?? "รายการ", amount: a.amount, category: a.category, key, dueOn: a.dueOn };
  return text(a.explanation, a.dueOn === null ? [payButton(d), keepButton(d), app()] : [keepButton(d), app()]);
}

// L8: kept in the plan — held back, not spent
export function keptMessage(d: Draft, s: Summary): TextMessage {
  const daily = s.budget.kind === "ok" ? `\nตอนนี้ใช้ได้วันละ ${baht(s.budget.dailyBudget)} บาท` : "";
  return text(`เก็บไว้ในแผนแล้ว ✓ ${line(d)}\nยังไม่หักเงินจริง กดจ่ายแล้วในแอปเมื่อจ่ายจริง${daily}`, [app()]);
}

// Someone adds the OA as a friend
export const welcomeMessage = (): TextMessage =>
  text(
    "สวัสดีครับ ยินดีต้อนรับสู่พอใช้\nจดรายจ่าย พิมพ์ได้เลย เช่น «ข้าว 45»\nถามก่อนจ่าย เช่น «พรุ่งนี้กินชาบู 300 ไหวไหม»\nเริ่มจากตั้งรอบเงินในแอปก่อนนะ",
    [app()],
  );

// Chat with the AI (card 15). The AI's reply, guarded in lib/chat/converse.ts
export const chatMessage = (reply: string): TextMessage => text(reply, [app()]);

// AI off, failed or broke a guard: hello, what is left today, the 3 things the bot does
export function chatFallbackMessage(s: Summary | null): TextMessage {
  const today = s ? budgetLine(s.budget, s.spentToday) : "ยังไม่ได้ตั้งรอบเงิน ตั้งค่าในแอปก่อนนะครับ";
  return text(
    [
      "สวัสดีครับ",
      today,
      "พอใช้ช่วยได้ 3 อย่างครับ",
      "• จดรายจ่าย พิมพ์ชื่อกับยอด เช่น «ข้าว 45»",
      "• ถามก่อนจ่าย เช่น «ชาบู 300 ไหวไหม»",
      "• ดูสรุปและตั้งค่าในแอป",
    ].join("\n"),
    [app()],
  );
}

// Not about money or the app: never the AI's words, always this
export const offTopicMessage = (): TextMessage =>
  text("เรื่องนี้พอใช้ช่วยไม่ได้นะครับ ถามเรื่องเงินได้เลย เช่น «วันนี้เหลือเท่าไร» หรือ «ชาบู 300 ไหวไหม»", [app()]);

// «ข้าว» / «ข้าวร้อยกว่า»: asked how much; the answer «45» is recorded (lib/line/handle-event.ts)
export const askAmountMessage = (title: string, approximate: boolean): TextMessage =>
  text(`${approximate ? "ขอยอดที่จ่ายจริงนะครับ " : ""}${title} จ่ายไปกี่บาทครับ? พิมพ์แค่ตัวเลขก็ได้ เช่น «45»`, [app("กรอกเองในแอป")]);

// A what-if without a price: ask it to try (nothing is waited for, so the answer is not recorded)
export const askPriceMessage = (item: string): TextMessage =>
  text(`${item} ราคาเท่าไรครับ? ถามพร้อมราคาได้เลย เช่น «${item} 300 ไหวไหม»`, [app()]);

// «45»: asked what for; the answer «ข้าว» is recorded
export const askTitleMessage = (amount: number): TextMessage =>
  text(`${baht(amount)} บาท ค่าอะไรครับ? พิมพ์ชื่อได้เลย เช่น «ข้าว»`, [app("กรอกเองในแอป")]);

// Postback data of the proposal buttons: only the key, the items stay in the chat memory
export const choiceData = (action: "all" | "no", key: string) => JSON.stringify({ a: action, k: key });

// Several spends split by the AI: nothing is recorded until the user taps
export function proposalMessage(items: ProposedItem[], key: string, todayRemaining: number | null): TextMessage {
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const lines = [`เจอ ${items.length} รายการ จดให้เลยไหมครับ?`, ...items.map((i) => `• ${line(i)}`), `รวม ${baht(total)} บาท`];
  if (todayRemaining !== null && todayRemaining >= 0 && total > todayRemaining) {
    lines.push(`เกินงบที่เหลือวันนี้ (${baht(todayRemaining)} บาท) อยู่ ${baht(total - todayRemaining)} บาท`);
  }
  const all = items.length > 1 ? "จดทั้งหมด" : "จดเลย";
  return text(lines.join("\n"), [
    { type: "postback", label: all, data: choiceData("all", key), displayText: all },
    { type: "postback", label: "ไม่ใช่", data: choiceData("no", key), displayText: "ไม่ใช่" },
    app("กรอกเองในแอป"),
  ]);
}

export const declinedMessage = (): TextMessage => text("โอเคครับ ไม่จด ส่งทีละรายการได้เลย เช่น «ข้าว 45»", [app("กรอกเองในแอป")]);

export const alreadyManyMessage = (): TextMessage => text("รายการชุดนี้จดไว้แล้วครับ ✓", [app()]);

export const expiredMessage = (): TextMessage => text("รายการนี้หมดเวลาแล้วครับ พิมพ์ใหม่อีกครั้งได้เลย", [app()]);
