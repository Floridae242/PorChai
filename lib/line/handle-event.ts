import { USER_CATEGORIES, type UserCategory } from "@/lib/api-types";
import { tomorrowBudget } from "@/lib/calc/budget";
import { thaiDate } from "@/lib/calc/time";
import { advise } from "@/lib/advice/advise";
import { isQuestion } from "@/lib/advice/question";
import {
  adviceMessage,
  alreadyMessage,
  askMessage,
  welcomeMessage,
  keptMessage,
  holdMessage,
  noCycleMessage,
  recordedMessage,
  tryMessage,
  type Draft,
} from "@/lib/chat/messages";
import { parseExpense } from "@/lib/chat/parse";
import { loadBudget, loadSummary, summaryOf } from "@/lib/db/budget";
import { addEntry, entryExists } from "@/lib/db/entries";
import { actOnPlan, addPlan, planIdByKey } from "@/lib/db/plans";
import { simulate } from "@/lib/db/simulate";
import { userIdForLine } from "@/lib/db/users";
import { HttpError } from "@/lib/http";
import { reply, type LineMessage } from "@/lib/line/reply";

interface LineEvent {
  type?: unknown;
  webhookEventId?: unknown;
  replyToken?: unknown;
  source?: { type?: unknown; userId?: unknown };
  message?: { type?: unknown; text?: unknown };
  postback?: { data?: unknown };
}

// The webhook verified LINE's signature before calling this, so source.userId is LINE's word, not the client's.
// Throws only when a spend could not be saved: the webhook then lets LINE deliver the event again.
export async function handleEvent(event: unknown): Promise<void> {
  const e = (event ?? {}) as LineEvent;
  const source = e.source;
  // Only one-to-one chats belong to a user; group and room events are not anyone's account
  if (source?.type !== "user" || typeof source.userId !== "string") return;
  const userId = await userIdForLine(source.userId);

  let answer: LineMessage | null = null;
  try {
    if (
      e.type === "message" &&
      e.message?.type === "text" &&
      typeof e.message.text === "string"
    ) {
      answer = await onText(userId, e.message.text, String(e.webhookEventId));
    } else if (e.type === "postback" && typeof e.postback?.data === "string") {
      answer = await onPostback(userId, e.postback.data);
    } else if (e.type === "follow") {
      answer = welcomeMessage();
    }
  } catch (err) {
    if (!(err instanceof HttpError && err.code === "no_cycle")) throw err;
    answer = noCycleMessage();
  }
  if (answer && typeof e.replyToken === "string") {
    // The spend is already saved; a failed answer must not make LINE send the event again
    await reply(e.replyToken, [answer]).catch((err) => console.error(err));
  }
}

// Saved under the first message's event id, so a redelivery or a second tap on the button saves nothing more
function record(userId: string, d: Draft) {
  return addEntry(
    userId,
    {
      amount: d.amount,
      category: d.category as UserCategory,
      note: d.title,
      spentOn: thaiDate(new Date()),
    },
    `line:${d.key}`,
    "chat",
  );
}

// Card 09 / Figma L2 + L6
async function onText(
  userId: string,
  body: string,
  eventId: string,
): Promise<LineMessage> {
  if (["สวัสดี", "เริ่มต้น", "เมนู", "ทดสอบ", "วิธีใช้"].includes(body.trim()))
    return welcomeMessage();
  // Card 15: «พรุ่งนี้กินชาบู 300 ไหวไหม» is a question, not a spend — answer it, save nothing
  if (isQuestion(body))
    return adviceMessage(await advise(userId, body), eventId);
  const parsed = parseExpense(body);
  if (parsed.kind === "ask") return askMessage(parsed.reason);
  const draft: Draft = {
    title: parsed.title,
    amount: parsed.amount,
    category: parsed.category,
    key: eventId,
  };

  const { budget } = await loadSummary(userId);
  // L6: more than what is left today → ask first, the user decides (never decided for them)
  if (
    budget.kind === "ok" &&
    budget.todayRemaining >= 0 &&
    draft.amount > budget.todayRemaining
  ) {
    return holdMessage(draft, budget.todayRemaining);
  }
  const { entry } = await record(userId, draft);
  return recorded(userId, draft, entry.id);
}

async function recorded(
  userId: string,
  d: Draft,
  entryId?: string,
): Promise<LineMessage> {
  const loaded = await loadBudget(userId);
  return recordedMessage(
    d,
    summaryOf(loaded),
    tomorrowBudget(loaded.input),
    entryId,
  );
}

// Buttons from holdMessage / tryMessage. Anything malformed is ignored.
async function onPostback(
  userId: string,
  data: string,
): Promise<LineMessage | null> {
  const draft = readDraft(data);
  if (!draft) return null;
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
      {
        kind: "purchase",
        title: draft.title,
        amount: draft.amount,
        dueOn: draft.dueOn ?? null,
        category: draft.category as UserCategory,
        status: "reserved",
        basis: null,
      },
      key,
    );
    return created
      ? keptMessage(draft, await loadSummary(userId))
      : alreadyMessage(draft);
  }
  // Kept first, paid now: pay that plan (card 57), so the money is not taken as a plan and a spend
  const planId = await planIdByKey(userId, key);
  if (planId) {
    const plan = await actOnPlan(
      userId,
      planId,
      "pay",
      draft.category as UserCategory,
      thaiDate(new Date()),
    );
    if (plan.status !== "paid") return alreadyMessage(draft);
    return recorded(userId, draft, plan.entryId ?? undefined);
  }
  const { created, entry } = await record(userId, draft);
  if (!created) return alreadyMessage(draft);
  return recorded(userId, draft, entry.id);
}

function readDraft(
  data: string,
): (Draft & { action: "pay" | "try" | "keep" }) | null {
  let d: {
    a?: unknown;
    t?: unknown;
    m?: unknown;
    c?: unknown;
    k?: unknown;
    d?: unknown;
  };
  try {
    d = JSON.parse(data);
  } catch {
    return null;
  }
  const ok =
    (d.a === "pay" || d.a === "try" || d.a === "keep") &&
    (d.d === undefined ||
      (typeof d.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.d))) &&
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
