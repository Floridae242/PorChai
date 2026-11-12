import { USER_CATEGORIES, type Summary, type UserCategory } from "@/lib/api-types";
import type { BudgetResult } from "@/lib/calc/budget";
import { baht, budgetLine, cheer, recordedMessage } from "@/lib/chat/messages";
import type { ReminderLog } from "@/lib/db/reminders";
import {
  buildHabitEditAskMessage,
  buildHabitReminderCard,
  buildHabitSkippedMessage,
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

export const demoNoHabitMessage = (): TextMessage =>
  text("ยังไม่มีรายการประจำครับ ต้องจดชื่อเดียวกันอย่างน้อย 3 วันใน 7 วันล่าสุด เช่น «ข้าวเที่ยง 50»");

export const isUserCategory = (c: string | undefined): c is UserCategory => USER_CATEGORIES.includes(c as UserCategory);
