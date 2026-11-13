import { USER_CATEGORIES, type SimulateResponse, type Summary, type UserCategory } from "@/lib/api-types";
import type { BudgetResult } from "@/lib/calc/budget";
import { adviceMessage, baht, budgetLine, cheer, choiceData, draftData, recordedManyMessage, recordedMessage, tryMessage, type Draft } from "@/lib/chat/messages";
import type { ProposedItem } from "@/lib/db/chat-memory";
import type { Advice } from "@/lib/advice/advise";
import { addDays } from "@/lib/calc/time";
import type { OcrDraft, TryDraft } from "@/lib/db/chat-memory";
import type { Entry } from "@/lib/api-types";
import type { ReminderLog } from "@/lib/db/reminders";
import {
  buildHabitEditAskMessage,
  buildHabitReminderCard,
  buildHabitSkippedMessage,
  buildAiCompareCard,
  buildHoldCard,
  buildIncomeCard,
  buildProposalCard,
  buildOcrDraftCard,
  buildTryBeforeBuyCard,
  buildWelcomeCard,
  buildRecordedCard,
  buildTodayBudgetCard,
  categoryLabel,
  encodePostback,
  miniAppUrl,
} from "@/lib/line/flex";
import { text, type QuickReplyAction, type ReplyMessage, type TextMessage } from "@/lib/line/reply";

// Card 10: what the bot says with โฟรวิว's Flex cards (lib/line/flex), and the answers to their buttons.
// The cards only draw; every number comes from the summary (one calculator).

export interface RecordedEntry {
  id: string;
  title: string;
  amount: number;
  category: UserCategory;
}

// "จดแล้ว ✓" as the card. Outside a normal budget (shortfall, payday passed) the text answer says it better.
export function recordedCard(e: RecordedEntry, s: Summary, tomorrow: BudgetResult, heading?: string): ReplyMessage {
  const b = s.budget;
  if (b.kind !== "ok") return recordedMessage({ ...e, key: e.id }, s, tomorrow);
  const over = b.todayRemaining < 0 && tomorrow.kind === "ok";
  return buildRecordedCard({
    entryId: e.id,
    heading,
    items: [{ id: e.id, title: e.title, amount: e.amount, category: e.category }],
    totalAmount: e.amount,
    dailyBudget: b.dailyBudget,
    spentToday: s.spentToday,
    todayRemaining: b.todayRemaining,
    tomorrowDailyBudget: over ? tomorrow.dailyBudget : null,
    subnote: cheer(b, over) ?? undefined, // the friendly last line (no AI, no numbers)
  });
}

// [จดทั้งหมด]: โฟรวิว's recorded card with every item (Figma L10), without [แก้]/[ลบ] — they fit one entry
export function recordedManyCard(entries: RecordedEntry[], s: Summary, tomorrow: BudgetResult): ReplyMessage {
  const b = s.budget;
  if (b.kind !== "ok") return recordedManyMessage(entries, s, tomorrow);
  const over = b.todayRemaining < 0 && tomorrow.kind === "ok";
  return buildRecordedCard({
    entryId: entries[0].id,
    items: entries.map((e) => ({ id: e.id, title: e.title, amount: e.amount, category: e.category })),
    totalAmount: entries.reduce((sum, e) => sum + e.amount, 0),
    dailyBudget: b.dailyBudget,
    spentToday: s.spentToday,
    todayRemaining: b.todayRemaining,
    tomorrowDailyBudget: over ? tomorrow.dailyBudget : null,
    subnote: cheer(b, over) ?? undefined,
    hideEntryActions: true,
  });
}

// «รับ 500»
export function incomeCard(amount: number, s: Summary): ReplyMessage {
  const b = s.budget;
  return {
    ...buildIncomeCard({
      amount,
      balance: s.balance,
      todayRemaining: b.kind === "ok" ? b.todayRemaining : null,
      dailyBudget: b.kind === "ok" ? b.dailyBudget : null,
    }),
    quickReply: { items: [{ type: "action", action: { type: "postback", label: "วันนี้ใช้ได้", data: encodePostback("menu_today", "income"), displayText: "วันนี้ใช้ได้เท่าไหร่" } }] },
  };
}

// Several spends split by the AI (card 15): nothing recorded until [จดทั้งหมด]
export function proposalCard(items: ProposedItem[], key: string, todayRemaining: number | null): ReplyMessage {
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const label = items.length > 1 ? "จดทั้งหมด" : "จดเลย";
  return {
    ...buildProposalCard({
      items,
      total,
      overToday: todayRemaining !== null && todayRemaining >= 0 && total > todayRemaining ? { remaining: todayRemaining, by: total - todayRemaining } : null,
      record: { label, data: choiceData("all", key) },
      notThis: { label: "ไม่ใช่", data: choiceData("no", key) },
    }),
    quickReply: { items: [{ type: "action", action: { type: "uri", label: "กรอกเองในแอป", uri: miniAppUrl("/app/record/new") } }] },
  };
}

// L6: over what is left today — held, [ยืนยันจ่ายจริง] / [ลองก่อนซื้อ] (the same buttons as before)
export const holdCard = (d: Draft, todayRemaining: number): ReplyMessage =>
  buildHoldCard({
    title: d.title,
    amount: d.amount,
    todayRemaining,
    pay: { label: "ยืนยันจ่ายจริง", data: draftData("pay", d) },
    tryFirst: { label: "ลองก่อนซื้อ", data: draftData("try", d) },
  });

// [วันนี้ใช้ได้]
export function todayCard(s: Summary): ReplyMessage {
  const b = s.budget;
  if (b.kind !== "ok") return text(budgetLine(b, s.spentToday));
  return buildTodayBudgetCard({
    todayRemaining: b.todayRemaining,
    spentToday: s.spentToday,
    dailyBudget: b.dailyBudget,
    disposablePool: b.usable,
    daysRemaining: b.daysLeft,
    savingsReserved: s.savings,
    bufferReserved: s.emergencyBuffer,
    balance: s.balance,
  });
}

const line = (e: RecordedEntry) => `${e.title} ${baht(e.amount)} บาท`;
const appEntry = (id: string, label = "แก้ในแอป"): QuickReplyAction => ({ type: "uri", label, uri: miniAppUrl(`/app/record/${id}`) });

// L9 [เปลี่ยนหมวด]: the four categories as quick replies
export const askCategoryMessage = (e: RecordedEntry): TextMessage =>
  text(
    `เปลี่ยน ${line(e)} เป็นหมวดไหนครับ?`,
    USER_CATEGORIES.map((c) => ({
      type: "postback",
      label: categoryLabel(c),
      data: encodePostback("entry_cat_set", e.id, c),
      displayText: categoryLabel(c),
    })),
  );

export const categoryChangedMessage = (e: RecordedEntry): TextMessage =>
  text(`เปลี่ยนหมวดแล้วครับ ✓ ${line(e)} → ${categoryLabel(e.category)}`, [appEntry(e.id, "ดูในแอป")]);

// [ลบ] asks once; ignoring it deletes nothing
export const askDeleteMessage = (e: RecordedEntry): TextMessage =>
  text(`ลบ ${line(e)} ใช่ไหมครับ? ถ้าไม่ลบ ไม่ต้องกดอะไร`, [
    { type: "postback", label: "ลบเลย", data: encodePostback("entry_del_ok", e.id), displayText: "ลบเลย" },
  ]);

export const deletedMessage = (e: RecordedEntry, s: Summary): TextMessage =>
  text(`ลบแล้วครับ ✓ ${line(e)}\n${budgetLine(s.budget, s.spentToday)}`, [appEntry(e.id, "ดูในแอป")]);

export const alreadyDeletedMessage = (e: RecordedEntry): TextMessage => text(`${line(e)} ลบไปแล้วครับ`);

// [แก้]: the next «50» is the new amount (lib/line/handle-event.ts)
export const askNewAmountMessage = (e: RecordedEntry): TextMessage =>
  text(`พิมพ์ยอดใหม่ของ ${e.title} ได้เลยครับ (ตอนนี้ ${baht(e.amount)} บาท) เช่น «50»`, [appEntry(e.id)]);

export const entryNotFoundMessage = (): TextMessage => text("ไม่พบรายการนี้ อาจถูกลบไปแล้วครับ");

// Rich menu [จดรายรับ/จ่าย]: only what the chat records today. โฟรวิว's how-to card also shows
// «เมื่อวาน ข้าว 45», which the chat cannot record (it is asked back), so it is not used here yet.
export const howToRecordMessage = (): TextMessage =>
  text(
    "จดรายจ่าย พิมพ์ชื่อกับยอดได้เลยครับ เช่น «ข้าว 45»\nรายรับ พิมพ์ รับ ตามด้วยยอด เช่น «รับ 500»\nหลายรายการพิมพ์ในข้อความเดียวได้ เช่น «ข้าว 45 กาแฟ 55» แล้วกดยืนยัน\nจดย้อนหลัง กรอกในแอปแล้วเลือกวันที่ได้เลย",
    [{ type: "uri", label: "กรอกในแอป", uri: miniAppUrl("/app/record/new") }],
  );

// Rich menu [ลองก่อนจ่าย]
export const howToTryMessage = (): TextMessage =>
  text("ลองก่อนจ่าย พิมพ์ของกับราคาแล้วถามได้เลยครับ เช่น «ชาบู 300 ไหวไหม» หรือ «ถ้าซื้อรองเท้า 500 จะเหลือวันละเท่าไร»", [
    { type: "uri", label: "ลองในแอป", uri: miniAppUrl("/app/try") },
  ]);

export const notWiredMessage = (): TextMessage => text("ปุ่มนี้ยังใช้ไม่ได้ครับ ทำในแอปได้เลย");

// Card 58 (Figma F2): the reminder, and the answers to its buttons
export const reminderCard = (log: ReminderLog, time: string): ReplyMessage =>
  buildHabitReminderCard({ reminderId: log.id, habitTitle: log.label, habitAmount: log.amount, timeLabel: time });

export const reminderEditMessage = (log: ReminderLog): ReplyMessage =>
  buildHabitEditAskMessage({ reminderId: log.id, habitTitle: log.label, habitAmount: log.amount });

export const reminderSkippedMessage = (log: ReminderLog, s: Summary): ReplyMessage =>
  buildHabitSkippedMessage({ habitTitle: log.label, todayRemaining: s.budget.kind === "ok" ? s.budget.todayRemaining : 0 });

export const reminderAlreadyMessage = (title: string, amount: number): TextMessage =>
  text(`${title} ${baht(amount)} บาท จดไว้แล้วครับ ✓`);

export const reminderNotFoundMessage = (): TextMessage => text("ไม่พบการเตือนนี้ครับ");

export const reminderEditCancelledMessage = (): TextMessage => text("ยกเลิกการแก้แล้วครับ ยังไม่ได้จดอะไร");

export const demoReadyMessage = (title: string, amount: number, time: string): TextMessage =>
  text(`เตรียมเดโมแล้วครับ ✓ ใส่ ${title} ${baht(amount)} บาท ย้อนหลัง 3 วัน (เวลา ${time}) พิมพ์ «เดโมเตือน» เพื่อดูการ์ดเตือนได้เลย`);

export const demoNoHabitMessage = (): TextMessage =>
  text("ยังไม่มีรายการประจำครับ ต้องจดชื่อเดียวกันอย่างน้อย 3 วันใน 7 วันล่าสุด เช่น «ข้าวเที่ยง 50»");

// OCR (layer 4): โฟรวิว's draft card. Asks the kind when the AI was not sure, or read an own-account transfer.
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const dayLabel = (date: string, today: string) =>
  date === today ? "วันนี้" : `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

export function ocrDraftCard(d: OcrDraft, today: string, same: Entry | null): ReplyMessage {
  return buildOcrDraftCard({
    ocrId: d.id,
    merchantName: d.merchant,
    amount: d.amount,
    dateLabel: dayLabel(d.date, today),
    candidateAmounts: d.candidates.filter((c) => c !== d.amount),
    duplicateEntry: same ? { id: same.id, title: same.note ?? "รายการ", amount: same.amount, timeLabel: dayLabel(same.spentOn, today) } : undefined,
    needsSlipKind: d.kind === "unknown" || d.kind === "transfer",
  });
}

export const slipUnreadableMessage = (): TextMessage =>
  text("อ่านสลิปไม่ออกครับ พิมพ์ชื่อกับยอดได้เลย เช่น «ข้าว 45» หรือกรอกในแอป", [
    { type: "uri", label: "กรอกในแอป", uri: miniAppUrl("/app/record/new") },
  ]);

export const ocrAskAmountMessage = (d: OcrDraft): TextMessage =>
  text(`พิมพ์ยอดที่ถูกต้องของ ${d.merchant} ได้เลยครับ (ตอนนี้ ${baht(d.amount)} บาท) เช่น «120»`);

export const ocrCancelledMessage = (): TextMessage => text("ยกเลิกแล้วครับ ไม่ได้จดอะไร");

export const ocrTransferMessage = (): TextMessage =>
  text("โอนระหว่างบัญชีตัวเอง ไม่นับเป็นรายจ่ายหรือรายรับครับ ไม่ได้จดอะไร");

export const ocrAlreadyMessage = (d: OcrDraft): TextMessage => text(`สลิปนี้บันทึกไปแล้วครับ ✓ ${d.merchant} ${baht(d.amount)} บาท`);

// Someone adds the OA as a friend: โฟรวิว's welcome card (set up in the app first)
export const welcomeCard = (): ReplyMessage => buildWelcomeCard();

const dueLabel = (dueOn: string | null, today: string) =>
  dueOn === null || dueOn === today ? "วันนี้" : dueOn === addDays(today, 1) ? "พรุ่งนี้" : dayLabel(dueOn, today);

// Card 15 «ชาบู 300 ไหวไหม»: โฟรวิว's AI compare card, the AI's (or the template's) words inside.
// Asking back (no price, essentials unknown) or no normal budget stays the text answer.
export function adviceCard(a: Advice, d: TryDraft, today: string): ReplyMessage {
  const before = a.before;
  if (a.verdict === "ask" || before?.kind !== "ok") return adviceMessage(a, d.key);
  const max = before.maxPurchase;
  return buildAiCompareCard({
    draftId: d.id,
    itemTitle: d.title,
    amount: d.amount,
    dueLabel: dueLabel(d.dueOn, today),
    maxSpendable: max,
    overBy: max === null ? 0 : Math.max(0, d.amount - max),
    beforeDaily: before.dailyBudget,
    afterDaily: a.after?.kind === "ok" ? a.after.dailyBudget : 0,
    explanation: a.explanation,
  });
}

// L6 [ลองก่อนซื้อ] and [ลองยอดอื่น]: โฟรวิว's try-before-buy card. A meal today offers pay / another price /
// not buying; anything else keep / pay / postpone. Asking back or no normal budget stays text.
export function tryCard(d: TryDraft, r: SimulateResponse): ReplyMessage {
  if (r.verdict === "ask" || r.before?.kind !== "ok" || r.after?.kind !== "ok") return tryMessage({ ...d }, r);
  return buildTryBeforeBuyCard({
    draftId: d.id,
    itemTitle: d.title,
    amount: d.amount,
    isMealToday: d.category === "food" && d.dueOn === null,
    beforeDaily: r.before.dailyBudget,
    afterDaily: r.after.dailyBudget,
    maxSpendable: r.before.maxPurchase,
    overBy: r.overLimitBy ?? 0,
    essentialsPerDay: r.checks?.essentialPerDay ?? null,
    billsTotal: r.checks?.bills,
  });
}

export const tryAskAmountMessage = (d: TryDraft): TextMessage =>
  text(`พิมพ์ราคาใหม่ของ ${d.title} ได้เลยครับ (ตอนนี้ ${baht(d.amount)} บาท) เช่น «250»`);

export const notBuyingMessage = (d: TryDraft): TextMessage => text(`โอเคครับ ไม่ซื้อ ${d.title} ไม่ได้จดอะไร`);

export const postponedMessage = (d: TryDraft): TextMessage =>
  text(`เลื่อนไปรอบหน้าแล้ว ✓ ${d.title} ${baht(d.amount)} บาท ไม่หักเงินรอบนี้ ดูได้ในแผน`, [
    { type: "uri", label: "เปิดแผน", uri: miniAppUrl("/app/plan") },
  ]);

export const notYetMessage = (d: TryDraft): TextMessage =>
  text(`ยังไม่ถึงวันครับ ${d.title} เป็นของวันอื่น กด «เก็บไว้ในแผน» ไว้ก่อน แล้วจ่ายจริงเมื่อถึงวัน`);

export const isUserCategory = (c: string | undefined): c is UserCategory => USER_CATEGORIES.includes(c as UserCategory);
