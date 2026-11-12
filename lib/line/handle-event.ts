import { USER_CATEGORIES, type UserCategory } from "@/lib/api-types";
import { tomorrowBudget } from "@/lib/calc/budget";
import { thaiDate } from "@/lib/calc/time";
import { advise } from "@/lib/advice/advise";
import { isQuestion, readQuestion } from "@/lib/advice/question";
import { factsOf, readChat, splitItems } from "@/lib/chat/converse";
import {
  adviceMessage,
  alreadyManyMessage,
  alreadyMessage,
  askAmountMessage,
  askMessage,
  askTitleMessage,
  chatFallbackMessage,
  chatMessage,
  declinedMessage,
  expiredMessage,
  welcomeMessage,
  keptMessage,
  holdMessage,
  noCycleMessage,
  offTopicMessage,
  proposalMessage,
  recordedManyMessage,
  recordedMessage,
  tryMessage,
  type Draft,
} from "@/lib/chat/messages";
import { amountOnly, categoryOf, MAX_TITLE, parseExpense } from "@/lib/chat/parse";
import { loadBudget, loadSummary, summaryOf } from "@/lib/db/budget";
import { proposalFor, recentChat, remember, type ChatLine, type Pending } from "@/lib/db/chat-memory";
import { addEntry, entryExists } from "@/lib/db/entries";
import { actOnPlan, addPlan, planIdByKey } from "@/lib/db/plans";
import { simulate } from "@/lib/db/simulate";
import { userIdForLine } from "@/lib/db/users";
import { HttpError } from "@/lib/http";
import { reply, type TextMessage } from "@/lib/line/reply";

interface LineEvent {
  type?: unknown;
  webhookEventId?: unknown;
  replyToken?: unknown;
  source?: { type?: unknown; userId?: unknown };
  message?: { type?: unknown; text?: unknown };
  postback?: { data?: unknown };
}

// What the bot says, and what that answer waits for (kept in the chat memory)
interface Answer {
  message: TextMessage;
  pending?: Pending;
}
const say = (message: TextMessage, pending?: Pending): Answer => ({ message, pending });

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
    } else if (e.type === "postback" && typeof e.postback?.data === "string") {
      const tapped = await onPostback(userId, e.postback.data);
      if (tapped) [said, answer] = [`(กด ${tapped.label})`, say(tapped.message)];
    } else if (e.type === "follow") {
      answer = say(welcomeMessage());
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
      { role: "bot", body: answer.message.text, pending: answer.pending },
    ]).catch((err) => console.error("chat memory", err instanceof Error ? err.name : ""));
  }
  if (typeof e.replyToken === "string") {
    // The spend is already saved; a failed answer must not make LINE send the event again
    await reply(e.replyToken, [answer.message]).catch((err) => console.error(err));
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
async function onText(userId: string, body: string, eventId: string): Promise<Answer> {
  const history = await recentChat(userId);
  const last = history.at(-1);
  const pending = last?.role === "bot" ? last.pending : null; // only the very next message answers it
  const parsed = parseExpense(body);

  // «ข้าว» → «กี่บาท?» → «45»
  const amount = amountOnly(body);
  if (pending?.kind === "amount" && amount !== null) {
    return spend(userId, { title: pending.title, amount, category: categoryOf(pending.title), key: eventId });
  }
  // «45» → «ค่าอะไร?» → «ข้าว»
  const title = body.trim();
  if (pending?.kind === "title" && parsed.kind === "ask" && parsed.reason === "no_amount" && !isQuestion(body) && title.length <= MAX_TITLE) {
    return spend(userId, { title, amount: pending.amount, category: categoryOf(title), key: eventId });
  }

  // Card 15: «พรุ่งนี้กินชาบู 300 ไหวไหม» is a question, not a spend — answer it, save nothing.
  // Without a price («เหลือกี่บาท?», «ชาบูไหวไหม») it is chat.
  const question = isQuestion(body);
  if (question && readQuestion(body).amount !== null) return say(adviceMessage(await advise(userId, body), eventId));
  if (parsed.kind === "entry") {
    return spend(userId, { title: parsed.title, amount: parsed.amount, category: parsed.category, key: eventId });
  }
  if (parsed.reason === "no_title" && amount !== null) return say(askTitleMessage(amount), { kind: "title", amount });
  if (parsed.reason === "too_large" || parsed.reason === "no_title") return say(askMessage(parsed.reason));

  if (parsed.reason === "many_amounts") {
    const { budget } = await loadSummary(userId); // no cycle → set up first, before using the AI
    const items = await splitItems(body);
    if (!items) return say(askMessage("many_amounts"));
    const left = budget.kind === "ok" ? budget.todayRemaining : null;
    return say(proposalMessage(items, eventId, left), { kind: "items", key: eventId, items });
  }

  // No amount or an approximate one: the AI reads it with the recent chat
  return converse(userId, body, history, parsed.reason === "approximate");
}

async function converse(userId: string, body: string, history: ChatLine[], approximate: boolean): Promise<Answer> {
  const summary = await loadSummary(userId).catch((err) => {
    if (err instanceof HttpError && err.code === "no_cycle") return null; // chatting works before setup
    throw err;
  });
  const reading = await readChat(body, history, factsOf(summary));
  if (reading?.kind === "spend") return say(askAmountMessage(reading.item, approximate), { kind: "amount", title: reading.item });
  if (reading?.kind === "off_topic") return say(offTopicMessage());
  if (reading?.kind === "chat" && reading.reply) return say(chatMessage(reading.reply));
  return say(approximate ? askMessage("approximate") : chatFallbackMessage(summary));
}

// L6: more than what is left today → ask first, the user decides (never decided for them)
async function spend(userId: string, draft: Draft): Promise<Answer> {
  const { budget } = await loadSummary(userId);
  if (budget.kind === "ok" && budget.todayRemaining >= 0 && draft.amount > budget.todayRemaining) {
    return say(holdMessage(draft, budget.todayRemaining));
  }
  await record(userId, draft);
  return say(await recorded(userId, draft));
}

async function recorded(userId: string, d: Draft): Promise<TextMessage> {
  const loaded = await loadBudget(userId);
  return recordedMessage(d, summaryOf(loaded), tomorrowBudget(loaded.input));
}

const LABEL = { pay: "ยืนยันจ่ายจริง", try: "ลองก่อนซื้อ", keep: "เก็บไว้ในแผน", all: "จดทั้งหมด", no: "ไม่ใช่" } as const;

// Buttons from holdMessage / tryMessage / adviceMessage / proposalMessage. Anything malformed is ignored.
async function onPostback(userId: string, data: string): Promise<{ label: string; message: TextMessage } | null> {
  const choice = readChoice(data);
  if (choice) return { label: LABEL[choice.action], message: await onChoice(userId, choice.action, choice.key) };
  const draft = readDraft(data);
  if (!draft) return null;
  return { label: LABEL[draft.action], message: await onDraft(userId, draft) };
}

// [จดทั้งหมด] / [ไม่ใช่] on several spends the AI split. Each item is saved once under its own key.
async function onChoice(userId: string, action: "all" | "no", key: string): Promise<TextMessage> {
  if (action === "no") return declinedMessage();
  const items = await proposalFor(userId, key);
  if (!items) return expiredMessage();
  const today = thaiDate(new Date());
  let created = false;
  for (const [i, it] of items.entries()) {
    const r = await addEntry(userId, { amount: it.amount, category: it.category, note: it.title, spentOn: today }, `line:${key}:${i}`, "chat");
    created ||= r.created;
  }
  if (!created) return alreadyManyMessage();
  const loaded = await loadBudget(userId);
  return recordedManyMessage(items, summaryOf(loaded), tomorrowBudget(loaded.input));
}

async function onDraft(userId: string, draft: Draft & { action: "pay" | "try" | "keep" }): Promise<TextMessage> {
  if (draft.action === "try") {
    const r = await simulate(userId, {
      amount: draft.amount,
      dueOn: null,
      postponePlanIds: [],
      essentials: null,
      emergencyBuffer: null,
      payday: null,
      balance: null,
    });
    return tryMessage(draft, r);
  }
  const key = `line:${draft.key}`;
  if (draft.action === "keep") {
    // Already paid from the same question: keeping it too would hold the money twice
    if (await entryExists(userId, key)) return alreadyMessage(draft);
    const { created } = await addPlan(
      userId,
      { kind: "purchase", title: draft.title, amount: draft.amount, dueOn: draft.dueOn ?? null, category: draft.category as UserCategory, status: "reserved", basis: null },
      key,
    );
    return created ? keptMessage(draft, await loadSummary(userId)) : alreadyMessage(draft);
  }
  // Kept first, paid now: pay that plan (card 57), so the money is not taken as a plan and a spend
  const planId = await planIdByKey(userId, key);
  if (planId) {
    const plan = await actOnPlan(userId, planId, "pay", draft.category as UserCategory, thaiDate(new Date()));
    if (plan.status !== "paid") return alreadyMessage(draft);
    return recorded(userId, draft);
  }
  const { created } = await record(userId, draft);
  if (!created) return alreadyMessage(draft);
  return recorded(userId, draft);
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
