import { USER_CATEGORIES, type UserCategory } from "@/lib/api-types";
import { tomorrowBudget } from "@/lib/calc/budget";
import { thaiDate } from "@/lib/calc/time";
import { advise, dueOnOf } from "@/lib/advice/advise";
import { findPriceHint } from "@/lib/advice/price-hint";
import { isBalanceQuestion, isQuestion, readQuestion } from "@/lib/advice/question";
import {
  alreadyDeletedMessage,
  adviceCard,
  holdCard,
  incomeCard,
  proposalCard,
  recordedManyCard,
  askCategoryMessage,
  askDeleteMessage,
  askNewAmountMessage,
  categoryChangedMessage,
  deletedMessage,
  demoNoHabitMessage,
  demoReadyMessage,
  reminderAlreadyMessage,
  reminderCard,
  reminderEditCancelledMessage,
  reminderEditMessage,
  reminderNotFoundMessage,
  reminderSkippedMessage,
  entryNotFoundMessage,
  isUserCategory,
  howToRecordMessage,
  howToTryMessage,
  notBuyingMessage,
  notWiredMessage,
  notYetMessage,
  postponedMessage,
  priceHintMessage,
  tryAskAmountMessage,
  tryCard,
  welcomeCard,
  ocrAlreadyMessage,
  ocrAskAmountMessage,
  ocrCancelledMessage,
  ocrDraftCard,
  ocrTransferMessage,
  slipUnreadableMessage,
  recordedCard,
  todayCard,
  type RecordedEntry,
} from "@/lib/chat/cards";
import { factsOf, readChat, splitItems } from "@/lib/chat/converse";
import {
  adviceMessage,
  alreadyManyMessage,
  alreadyMessage,
  askAmountMessage,
  askPriceMessage,
  askMessage,
  askTitleMessage,
  chatFallbackMessage,
  chatMessage,
  declinedMessage,
  expiredMessage,
  keptMessage,
  noCycleMessage,
  offTopicMessage,
  recordedMessage,
  type Draft,
} from "@/lib/chat/messages";
import { amountOnly, categoryOf, MAX_TITLE, parseExpense } from "@/lib/chat/parse";
import { loadBudget, loadSummary, requireActiveCycle, summaryOf } from "@/lib/db/budget";
import { ocrDraftFor, proposalFor, recentChat, remember, tryDraftFor, type ChatLine, type OcrDraft, type Pending, type TryDraft } from "@/lib/db/chat-memory";
import { DEMO_HABIT, demoReminder, markReminder, reminderById, seedDemoHabit, type ReminderLog } from "@/lib/db/reminders";
import { addEntry, cancelEntry, editEntry, entryExists, entryForChat, sameAmountOn } from "@/lib/db/entries";
import { messageImage } from "@/lib/line/content";
import { readSlip } from "@/lib/ocr/slip";
import { addIncome } from "@/lib/db/income";
import { activePriceHints } from "@/lib/db/price-hints";
import { actOnPlan, addPlan, planIdByKey } from "@/lib/db/plans";
import { simulate } from "@/lib/db/simulate";
import { userIdForLine } from "@/lib/db/users";
import { HttpError } from "@/lib/http";
import { decodePostback, type DecodedPostback } from "@/lib/line/flex/postback";
import { reply, text, withAppButton, type ReplyMessage } from "@/lib/line/reply";

interface LineEvent {
  type?: unknown;
  webhookEventId?: unknown;
  replyToken?: unknown;
  source?: { type?: unknown; userId?: unknown };
  message?: { type?: unknown; text?: unknown; id?: unknown };
  postback?: { data?: unknown };
}

// What the bot says, and what that answer waits for (kept in the chat memory)
interface Answer {
  message: ReplyMessage;
  pending?: Pending;
}
const say = (message: ReplyMessage, pending?: Pending): Answer => ({ message, pending });

// The webhook verified LINE's signature before calling this, so source.userId is LINE's word, not the client's.
// Throws only when a spend could not be saved: the webhook then lets LINE deliver the event again.
export async function handleEvent(event: unknown): Promise<void> {
  const e = (event ?? {}) as LineEvent;
  const source = e.source;
  // Only one-to-one chats belong to a user; group and room events are not anyone's account
  if (source?.type !== "user" || typeof source.userId !== "string") return;
  const userId = await userIdForLine(source.userId);

  let said: string | null = null; // the user's side of the chat memory
  let answer: Answer | null = null;
  try {
    if (e.type === "message" && e.message?.type === "text" && typeof e.message.text === "string") {
      said = e.message.text;
      answer = await onText(userId, e.message.text, String(e.webhookEventId));
    } else if (e.type === "message" && e.message?.type === "image" && typeof e.message.id === "string") {
      said = "(ส่งรูป)"; // the photo itself is never kept
      answer = await onPhoto(userId, e.message.id);
    } else if (e.type === "postback" && typeof e.postback?.data === "string") {
      const tapped = await onPostback(userId, e.postback.data);
      if (tapped) [said, answer] = [`(กด ${tapped.label})`, tapped.answer];
    } else if (e.type === "follow") {
      answer = say(welcomeCard());
    }
  } catch (err) {
    if (!(err instanceof HttpError && err.code === "no_cycle")) throw err;
    answer = say(noCycleMessage());
  }
  if (!answer) return;
  if (said !== null) {
    // Memory only helps the next reply; losing it must not lose the spend or make LINE send the event again
    await remember(userId, [
      { role: "user", body: said },
      { role: "bot", body: answer.message.type === "text" ? answer.message.text : answer.message.altText, pending: answer.pending },
    ]).catch((err) => console.error("chat memory", err instanceof Error ? err.name : ""));
  }
  if (typeof e.replyToken === "string") {
    // The spend is already saved; a failed answer must not make LINE send the event again
    await reply(e.replyToken, [withAppButton(answer.message)]).catch((err) => console.error(err));
  }
}

// Saved under the first message's event id, so a redelivery or a second tap on the button saves nothing more
function record(userId: string, d: Draft) {
  return addEntry(
    userId,
    { amount: d.amount, category: d.category as UserCategory, note: d.title, spentOn: thaiDate(new Date()) },
    `line:${d.key}`,
    "chat",
  );
}

// Card 09 / Figma L2 + L6, card 15. The rules read first; the AI only when they cannot.
// What the OA Manager menu's buttons send («วันนี้ใช้ได้เท่าไหร่» is already a balance question)
const MENU_TEXTS: Record<string, () => ReplyMessage> = {
  วิธีจดรายการ: howToRecordMessage,
  ลองก่อนจ่าย: howToTryMessage,
};

async function onText(userId: string, body: string, eventId: string): Promise<Answer> {
  const history = await recentChat(userId);
  const last = history.at(-1);
  const pending = last?.role === "bot" ? last.pending : null; // only the very next message answers it
  const parsed = parseExpense(body);

  // Card 58 demo: the presenter cannot wait for the reminder time (only with DEMO_MODE=1)
  if (process.env.DEMO_MODE === "1" && body.trim() === "เดโมเตรียม") {
    await seedDemoHabit(userId);
    return say(demoReadyMessage(DEMO_HABIT.title, DEMO_HABIT.amount, DEMO_HABIT.time));
  }
  if (process.env.DEMO_MODE === "1" && body.trim() === "เดโมเตือน") {
    const demo = await demoReminder(userId);
    return say(demo ? reminderCard(demo.log, demo.time) : demoNoHabitMessage());
  }
  // The rich menu made in LINE OA Manager sends texts, not postbacks (it has no postback buttons)
  const menu = MENU_TEXTS[body.trim()];
  if (menu) return say(menu());
  const amount = amountOnly(body);
  // Try card [ลองยอดอื่น] → «250»: try the new price (a new draft: paying it is a new spend)
  if (pending?.kind === "try" && pending.awaiting === "amount" && amount !== null) {
    return tryAnswer(userId, { ...pending.draft, id: crypto.randomUUID(), amount, key: eventId });
  }
  // OCR [แก้ยอด] → «120»: the draft again with the new amount, still to confirm
  if (pending?.kind === "ocr" && pending.awaiting === "amount" && amount !== null) {
    return ocrDraftAnswer(userId, { ...pending.draft, amount });
  }
  // Card 58 [แก้ยอด] → «60»: record the reminded habit with the amount typed
  if (pending?.kind === "reminder" && amount !== null) {
    const log = await reminderById(userId, pending.reminderId);
    return say(log ? await recordReminder(userId, log, amount) : reminderNotFoundMessage());
  }
  // Card 10 [แก้] → «50»: the new amount of that entry
  if (pending?.kind === "edit" && amount !== null) return say(await editAmount(userId, pending.entryId, amount));
  // «ข้าว» → «กี่บาท?» → «45»
  if (pending?.kind === "amount" && amount !== null) {
    return spend(userId, { title: pending.title, amount, category: categoryOf(pending.title), key: eventId });
  }
  // «45» → «ค่าอะไร?» → «ข้าว»
  const title = body.trim();
  if (pending?.kind === "title" && parsed.kind === "ask" && parsed.reason === "no_amount" && !isQuestion(body) && title.length <= MAX_TITLE) {
    return spend(userId, { title, amount: pending.amount, category: categoryOf(title), key: eventId });
  }

  // «เหลือเท่าไร», «งบเหลือป่ะ»: the budget card, its numbers from the calculator (the AI is never asked)
  if (isBalanceQuestion(body)) return say(todayCard(await loadSummary(userId)));

  // Card 15: «พรุ่งนี้กินชาบู 300 ไหวไหม» is a question, not a spend — answer it, save nothing.
  // Without one clear price («เหลือกี่บาท?», «ชาบู 150 หรือ 200 ดี») it is chat. A question never
  // reaches a path that records (bug 13 Nov: a what-if was saved as a spend).
  if (isQuestion(body)) {
    if (readQuestion(body).amount !== null) return adviceAnswer(userId, body, eventId);
    // «ถ้ากินตี๋น้อยจะเหลือเท่าไร»: a shop in the team's price table → its usual price, to try only
    const hint = findPriceHint(body, await activePriceHints());
    if (hint) {
      const dueOn = dueOnOf(readQuestion(body).day, thaiDate(new Date()));
      const draft: TryDraft = { id: crypto.randomUUID(), title: hint.name, amount: hint.price, category: hint.category, key: eventId, dueOn };
      return say(priceHintMessage(hint, draft), { kind: "try", draft, awaiting: "amount" });
    }
    return converse(userId, body, history, { approximate: false, question: true });
  }
  // «รับ 500»: income, saved once under this message (a redelivery adds nothing)
  if (parsed.kind === "income") {
    await addIncome(userId, { amount: parsed.amount, note: parsed.note, receivedOn: thaiDate(new Date()) }, `line:${eventId}`, "chat");
    return say(incomeCard(parsed.amount, await loadSummary(userId)));
  }
  if (parsed.kind === "entry") {
    return spend(userId, { title: parsed.title, amount: parsed.amount, category: parsed.category, key: eventId });
  }
  if (parsed.reason === "no_title" && amount !== null) return say(askTitleMessage(amount), { kind: "title", amount });
  if (["too_large", "no_title", "income", "backdated"].includes(parsed.reason)) return say(askMessage(parsed.reason));

  if (parsed.reason === "many_amounts") {
    const { budget } = await loadSummary(userId); // no cycle → set up first, before using the AI
    const items = await splitItems(body);
    if (!items) return say(askMessage("many_amounts"));
    const left = budget.kind === "ok" ? budget.todayRemaining : null;
    return say(proposalCard(items, eventId, left), { kind: "items", key: eventId, items });
  }

  // No amount or an approximate one: the AI reads it with the recent chat
  return converse(userId, body, history, { approximate: parsed.reason === "approximate", question: false });
}

async function converse(
  userId: string,
  body: string,
  history: ChatLine[],
  { approximate, question }: { approximate: boolean; question: boolean },
): Promise<Answer> {
  const summary = await loadSummary(userId).catch((err) => {
    if (err instanceof HttpError && err.code === "no_cycle") return null; // chatting works before setup
    throw err;
  });
  const reading = await readChat(body, history, factsOf(summary));
  if (reading?.kind === "spend") {
    // «ถ้ากินชาบูจะเหลือเท่าไร»: ask the price to try it, never «จ่ายไปกี่บาท?» (whose answer is recorded)
    if (question) return say(askPriceMessage(reading.item));
    return say(askAmountMessage(reading.item, approximate), { kind: "amount", title: reading.item });
  }
  if (reading?.kind === "off_topic") return say(offTopicMessage());
  if (reading?.kind === "chat" && reading.reply) return say(chatMessage(reading.reply));
  return say(approximate ? askMessage("approximate") : chatFallbackMessage(summary));
}

// L6: more than what is left today → ask first, the user decides (never decided for them)
async function spend(userId: string, draft: Draft): Promise<Answer> {
  const { budget } = await loadSummary(userId);
  if (budget.kind === "ok" && budget.todayRemaining >= 0 && draft.amount > budget.todayRemaining) {
    return say(holdCard(draft, budget.todayRemaining));
  }
  const { entry } = await record(userId, draft);
  return say(await recorded(userId, { ...draft, category: draft.category as UserCategory, id: entry.id }));
}

// Card 10: โฟรวิว's recorded card, its buttons pointing at this entry
async function recorded(userId: string, e: RecordedEntry, heading?: string): Promise<ReplyMessage> {
  const loaded = await loadBudget(userId);
  return recordedCard(e, summaryOf(loaded), tomorrowBudget(loaded.input), heading);
}

const LABEL = { pay: "ยืนยันจ่ายจริง", try: "ลองก่อนซื้อ", keep: "เก็บไว้ในแผน", all: "จดทั้งหมด", no: "ไม่ใช่" } as const;

// Buttons from holdMessage / tryMessage / adviceMessage / proposalMessage. Anything malformed is ignored.
async function onPostback(userId: string, data: string): Promise<{ label: string; answer: Answer } | null> {
  const flex = decodePostback(data);
  if (flex) return { label: flexLabel(flex), answer: await onCardButton(userId, flex) };
  const choice = readChoice(data);
  if (choice) return { label: LABEL[choice.action], answer: say(await onChoice(userId, choice.action, choice.key)) };
  const draft = readDraft(data);
  if (!draft) return null;
  if (draft.action === "try") {
    const { title, amount, category, key, dueOn } = draft;
    const d = { id: crypto.randomUUID(), title, amount, category: category as UserCategory, key, dueOn: dueOn ?? null };
    return { label: LABEL.try, answer: await tryAnswer(userId, d) };
  }
  return { label: LABEL[draft.action], answer: say(await onDraft(userId, draft)) };
}

// [จดทั้งหมด] / [ไม่ใช่] on several spends the AI split. Each item is saved once under its own key.
async function onChoice(userId: string, action: "all" | "no", key: string): Promise<ReplyMessage> {
  if (action === "no") return declinedMessage();
  const items = await proposalFor(userId, key);
  if (!items) return expiredMessage();
  const today = thaiDate(new Date());
  let created = false;
  const entries: RecordedEntry[] = [];
  for (const [i, it] of items.entries()) {
    const r = await addEntry(userId, { amount: it.amount, category: it.category, note: it.title, spentOn: today }, `line:${key}:${i}`, "chat");
    created ||= r.created;
    entries.push({ id: r.entry.id, title: it.title, amount: it.amount, category: it.category });
  }
  if (!created) return alreadyManyMessage();
  const loaded = await loadBudget(userId);
  return recordedManyCard(entries, summaryOf(loaded), tomorrowBudget(loaded.input));
}

async function onDraft(userId: string, draft: Draft & { action: "pay" | "try" | "keep" }): Promise<ReplyMessage> {
  if (draft.action === "keep") return keepDraft(userId, draft);
  if (draft.action === "pay") return payDraft(userId, draft);
  return notWiredMessage(); // "try" is answered with a card before this; never pay or keep by default
}

// เก็บไว้ในแผน: held back, not spent (card 57). Already paid from the same question → nothing held on top.
async function keepDraft(userId: string, draft: Draft, status: "reserved" | "postponed" = "reserved"): Promise<ReplyMessage> {
  const key = `line:${draft.key}`;
  if (await entryExists(userId, key)) return alreadyMessage(draft);
  const { created } = await addPlan(
    userId,
    { kind: "purchase", title: draft.title, amount: draft.amount, dueOn: draft.dueOn ?? null, category: draft.category as UserCategory, status, basis: null },
    key,
  );
  return created ? keptMessage(draft, await loadSummary(userId)) : alreadyMessage(draft);
}

// ยืนยันจ่ายจริง: recorded once under the first message's key
async function payDraft(userId: string, draft: Draft): Promise<ReplyMessage> {
  const key = `line:${draft.key}`;
  // Kept first, paid now: pay that plan (card 57), so the money is not taken as a plan and a spend
  const planId = await planIdByKey(userId, key);
  if (planId) {
    const plan = await actOnPlan(userId, planId, "pay", draft.category as UserCategory, thaiDate(new Date()));
    if (plan.status !== "paid") return alreadyMessage(draft);
    if (!plan.entryId) return recordedMessage(draft, await loadSummary(userId), tomorrowBudget((await loadBudget(userId)).input));
    return recorded(userId, { ...draft, category: draft.category as UserCategory, id: plan.entryId });
  }
  const { entry, created } = await record(userId, draft);
  if (!created) return alreadyMessage(draft);
  return recorded(userId, { ...draft, category: draft.category as UserCategory, id: entry.id });
}

// Card 15 «ชาบู 300 ไหวไหม»: the answer as โฟรวิว's AI compare card, its buttons pointing at this draft
async function adviceAnswer(userId: string, body: string, eventId: string): Promise<Answer> {
  const a = await advise(userId, body);
  if (a.verdict === "ask" || a.amount === null) return say(adviceMessage(a, eventId));
  const draft: TryDraft = { id: crypto.randomUUID(), title: a.item ?? "รายการ", amount: a.amount, category: a.category, key: eventId, dueOn: a.dueOn };
  return say(adviceCard(a, draft, thaiDate(new Date())), { kind: "try", draft });
}

// L6 [ลองก่อนซื้อ] / [ลองยอดอื่น]: card 14's try as โฟรวิว's card. Nothing is saved.
async function tryAnswer(userId: string, d: TryDraft): Promise<Answer> {
  const r = await simulate(userId, {
    amount: d.amount,
    dueOn: d.dueOn,
    postponePlanIds: [],
    essentials: null,
    emergencyBuffer: null,
    payday: null,
    balance: null,
  });
  return say(tryCard(d, r), { kind: "try", draft: d });
}

// The try / AI compare cards' buttons. The draft is the latest version in the chat memory (owner only);
// ไม่ซื้อ closes it. Paying or keeping happens once under the draft's key, like the text buttons.
async function onTryButton(userId: string, p: DecodedPostback): Promise<Answer> {
  const found = await tryDraftFor(userId, p.id);
  if (!found || found.closed) return say(expiredMessage());
  const d = found.draft;
  const draft: Draft = { title: d.title, amount: d.amount, category: d.category, key: d.key, dueOn: d.dueOn };
  if (p.action === "try_cancel") return say(notBuyingMessage(d), { kind: "try", draft: d, closed: true });
  if (p.action === "try_other") return say(tryAskAmountMessage(d), { kind: "try", draft: d, awaiting: "amount" });
  if (p.action === "try_hint") return tryAnswer(userId, d);
  if (p.action === "keep_plan") return say(await keepDraft(userId, draft));
  if (p.action === "postpone_next") {
    const answer = await keepDraft(userId, { ...draft, dueOn: null }, "postponed");
    return say(answer.type === "text" && answer.text.startsWith("เก็บไว้ในแผนแล้ว") ? postponedMessage(d) : answer);
  }
  // Only [ยืนยันจ่ายจริง] pays: a button added here but not wired must never record money (R01)
  if (p.action !== "pay_real") return say(notWiredMessage());
  // pay_real: another day's item is kept, not paid, until that day
  if (d.dueOn && d.dueOn > thaiDate(new Date())) return say(notYetMessage(d));
  return say(await payDraft(userId, draft));
}

const FLEX_LABEL: Partial<Record<DecodedPostback["action"], string>> = {
  entry_edit: "แก้",
  entry_cat: "เปลี่ยนหมวด",
  entry_cat_set: "เลือกหมวด",
  entry_del: "ลบ",
  entry_del_ok: "ลบเลย",
  menu_today: "วันนี้ใช้ได้",
  menu_record: "จดรายรับ/จ่าย",
  menu_try: "ลองก่อนจ่าย",
  rem_yes: "ใช่ จดเลย",
  rem_edit: "แก้ยอด",
  rem_skip: "วันนี้ไม่ได้ซื้อ",
  rem_edit_cancel: "ยกเลิกการแก้",
  keep_plan: "เก็บไว้ในแผน",
  pay_real: "ยืนยันจ่ายจริง",
  try_other: "ลองยอดอื่น",
  try_hint: "ใช้ราคานี้ลอง",
  try_cancel: "ไม่ซื้อ",
  postpone_next: "เลื่อนไปรอบหน้า",
  ocr_save: "บันทึก",
  ocr_edit: "แก้ยอด",
  ocr_cancel: "ยกเลิก",
  ocr_pick_amount: "เลือกยอด",
  ocr_kind_expense: "รายจ่าย",
  ocr_kind_income: "รับเงิน",
  ocr_kind_transfer: "โอนระหว่างบัญชี",
};
const flexLabel = (p: DecodedPostback) => FLEX_LABEL[p.action] ?? "กดปุ่มบนการ์ด";

const asRecorded = (e: { id: string; note: string | null; amount: number; category: string }): RecordedEntry => ({
  id: e.id,
  title: e.note ?? "รายการ",
  amount: e.amount,
  category: (isUserCategory(e.category) ? e.category : "other") as UserCategory,
});

// Card 10: the buttons on โฟรวิว's cards (format v1.<action>.<id>, lib/line/flex/postback.ts).
// Every entry id is checked against the user: someone else's id is "not found", never touched.
async function onCardButton(userId: string, p: DecodedPostback): Promise<Answer> {
  if (p.action === "menu_today") return say(todayCard(await loadSummary(userId)));
  // Rich menu (โฟรวิว's spec): how to record / how to ask before paying
  if (p.action === "menu_record") return say(howToRecordMessage());
  if (p.action === "menu_try") return say(howToTryMessage());
  if (p.action.startsWith("rem_")) return onReminderButton(userId, p);
  if (p.action.startsWith("ocr_")) return onOcrButton(userId, p);
  if (["keep_plan", "pay_real", "try_other", "try_hint", "try_cancel", "postpone_next"].includes(p.action)) return onTryButton(userId, p);
  if (!["entry_edit", "entry_cat", "entry_cat_set", "entry_del", "entry_del_ok"].includes(p.action)) return say(notWiredMessage());
  try {
    const { entry, cancelled } = await entryForChat(userId, p.id);
    const e = asRecorded(entry);
    if (cancelled) return say(alreadyDeletedMessage(e));
    if (p.action === "entry_cat") return say(askCategoryMessage(e));
    if (p.action === "entry_cat_set") {
      if (!isUserCategory(p.extra)) return say(notWiredMessage());
      return say(categoryChangedMessage(asRecorded(await editEntry(userId, e.id, { category: p.extra }))));
    }
    if (p.action === "entry_del") return say(askDeleteMessage(e));
    if (p.action === "entry_del_ok") {
      await cancelEntry(userId, e.id);
      return say(deletedMessage(e, await loadSummary(userId)));
    }
    // entry_edit: the next «50» is the new amount
    return say(askNewAmountMessage(e), { kind: "edit", entryId: e.id, title: e.title });
  } catch (err) {
    if (err instanceof HttpError && err.code !== "no_cycle") return say(err.code === "not_found" ? entryNotFoundMessage() : text(err.message));
    throw err;
  }
}

// OCR (layer 4): read the slip, answer with the draft card. Nothing is recorded here (user's choice 13 Nov).
async function onPhoto(userId: string, messageId: string): Promise<Answer> {
  await requireActiveCycle(userId); // no cycle → set up first, before using the AI
  const image = await messageImage(messageId);
  const reading = image && (await readSlip(image.bytes, image.mimeType, thaiDate(new Date())));
  if (!reading) return say(slipUnreadableMessage());
  return ocrDraftAnswer(userId, { id: crypto.randomUUID(), ...reading });
}

async function ocrDraftAnswer(userId: string, draft: OcrDraft): Promise<Answer> {
  const same = await sameAmountOn(userId, draft.date, draft.amount);
  return say(ocrDraftCard(draft, thaiDate(new Date()), same), { kind: "ocr", draft });
}

// The draft card's buttons. The draft is the latest version in the chat memory (30 minutes); a
// cancelled one, an own transfer or someone else's id does nothing. Saving is keyed by the draft.
async function onOcrButton(userId: string, p: DecodedPostback): Promise<Answer> {
  const found = await ocrDraftFor(userId, p.id);
  if (!found || found.closed) return say(expiredMessage());
  const { draft } = found;
  if (p.action === "ocr_cancel") return say(ocrCancelledMessage(), { kind: "ocr", draft, closed: true });
  if (p.action === "ocr_kind_transfer") return say(ocrTransferMessage(), { kind: "ocr", draft, closed: true });
  if (p.action === "ocr_kind_expense") return ocrDraftAnswer(userId, { ...draft, kind: "expense" });
  if (p.action === "ocr_kind_income") return ocrDraftAnswer(userId, { ...draft, kind: "income" });
  if (p.action === "ocr_pick_amount") {
    const picked = Number(p.extra);
    return draft.candidates.includes(picked) ? ocrDraftAnswer(userId, { ...draft, amount: picked }) : say(ocrDraftCard(draft, thaiDate(new Date()), null), { kind: "ocr", draft });
  }
  if (p.action === "ocr_edit") return say(ocrAskAmountMessage(draft), { kind: "ocr", draft, awaiting: "amount" });
  if (p.action !== "ocr_save") return say(notWiredMessage());
  if (draft.kind === "unknown" || draft.kind === "transfer") return ocrDraftAnswer(userId, draft); // pick the kind first
  const key = `ocr:${draft.id}`;
  if (draft.kind === "income") {
    const { created } = await addIncome(userId, { amount: draft.amount, note: draft.merchant, receivedOn: draft.date }, key, "chat");
    return say(created ? incomeCard(draft.amount, await loadSummary(userId)) : ocrAlreadyMessage(draft));
  }
  const { entry, created } = await addEntry(
    userId,
    { amount: draft.amount, category: categoryOf(draft.merchant), note: draft.merchant, spentOn: draft.date },
    key,
    "ocr",
  );
  if (!created) return say(ocrAlreadyMessage(draft));
  return say(await recorded(userId, asRecorded(entry)));
}

// Card 58: the reminder card's buttons. Recording is keyed by the reminder, so ใช่ จดเลย twice, or
// แก้ยอด then ใช่ จดเลย, records once.
async function onReminderButton(userId: string, p: DecodedPostback): Promise<Answer> {
  const log = await reminderById(userId, p.id);
  if (!log) return say(reminderNotFoundMessage());
  if (p.action === "rem_yes") return say(await recordReminder(userId, log, log.amount));
  if (p.action === "rem_edit") {
    // Already recorded (phone 13 Nov: ใช่ จดเลย, then แก้ยอด): edit that entry, as the recorded card's [แก้] does
    if (log.status === "recorded" && log.entry_id) {
      const { entry, cancelled } = await entryForChat(userId, log.entry_id);
      if (!cancelled) {
        const e = asRecorded(entry);
        return say(askNewAmountMessage(e), { kind: "edit", entryId: e.id, title: e.title });
      }
    }
    return say(reminderEditMessage(log), { kind: "reminder", reminderId: log.id });
  }
  if (p.action === "rem_edit_cancel") return say(reminderEditCancelledMessage());
  // rem_skip: not today, and not reminded again today (its row stays)
  if (log.status !== "recorded") await markReminder(log.id, "skipped");
  return say(reminderSkippedMessage(log, await loadSummary(userId)));
}

async function recordReminder(userId: string, log: ReminderLog, amount: number): Promise<ReplyMessage> {
  const { entry, created } = await addEntry(
    userId,
    { amount, category: log.category, note: log.label, spentOn: log.day },
    `reminder:${log.id}`,
    "reminder",
  );
  if (!created) return reminderAlreadyMessage(log.label, entry.amount);
  await markReminder(log.id, "recorded", entry.id);
  return recorded(userId, { id: entry.id, title: log.label, amount: entry.amount, category: log.category });
}

async function editAmount(userId: string, entryId: string, amount: number): Promise<ReplyMessage> {
  try {
    const entry = await editEntry(userId, entryId, { amount });
    return recorded(userId, asRecorded(entry), "แก้แล้ว ✓");
  } catch (err) {
    if (err instanceof HttpError && err.code !== "no_cycle") return err.code === "not_found" ? entryNotFoundMessage() : text(err.message);
    throw err;
  }
}

function readDraft(data: string): (Draft & { action: "pay" | "try" | "keep" }) | null {
  let d: { a?: unknown; t?: unknown; m?: unknown; c?: unknown; k?: unknown; d?: unknown };
  try {
    d = JSON.parse(data);
  } catch {
    return null;
  }
  const ok =
    (d.a === "pay" || d.a === "try" || d.a === "keep") &&
    (d.d === undefined || (typeof d.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.d))) &&
    typeof d.t === "string" &&
    d.t.length > 0 &&
    d.t.length <= 40 &&
    typeof d.m === "number" &&
    Number.isSafeInteger(d.m) &&
    d.m > 0 &&
    d.m <= 10_000_000 &&
    USER_CATEGORIES.includes(d.c as UserCategory) &&
    typeof d.k === "string" &&
    d.k.length > 0 &&
    d.k.length <= 64;
  if (!ok) return null;
  return {
    action: d.a as "pay" | "try" | "keep",
    title: d.t as string,
    amount: d.m as number,
    category: d.c as UserCategory,
    key: d.k as string,
    dueOn: (d.d as string | undefined) ?? null,
  };
}

function readChoice(data: string): { action: "all" | "no"; key: string } | null {
  let d: { a?: unknown; k?: unknown };
  try {
    d = JSON.parse(data);
  } catch {
    return null;
  }
  if ((d?.a !== "all" && d?.a !== "no") || typeof d.k !== "string" || d.k.length === 0 || d.k.length > 64) return null;
  return { action: d.a, key: d.k };
}
