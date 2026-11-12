import { USER_CATEGORIES, type Summary, type UserCategory } from "@/lib/api-types";
import type { BudgetResult } from "@/lib/calc/budget";
import { baht, budgetLine, cheer, recordedMessage } from "@/lib/chat/messages";
import type { OcrDraft } from "@/lib/db/chat-memory";
import type { Entry } from "@/lib/api-types";
import type { ReminderLog } from "@/lib/db/reminders";
import {
  buildHabitEditAskMessage,
  buildHabitReminderCard,
  buildHabitSkippedMessage,
  buildOcrDraftCard,
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

export const isUserCategory = (c: string | undefined): c is UserCategory => USER_CATEGORIES.includes(c as UserCategory);
