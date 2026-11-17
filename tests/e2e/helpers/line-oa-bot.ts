/**
 * LINE OA side of the PM live demo: a LINE-style chat page and a bot that answers like the real webhook.
 *
 * Why a stand-in: the real bot (app/api/line/webhook → lib/line/handle-event.ts) reads and writes Supabase,
 * keeps its chat memory there, and calls Gemini for free text and slip OCR, while the demo's MINI App runs on
 * the in-memory backend (tests/e2e/helpers/liff-mock.ts). To keep ONE shared state, this bot follows
 * handle-event.ts's routing for the messages the demo sends, but:
 *   - every reply is built by the app's own code: lib/chat/parse, lib/chat/actions/parse, lib/chat/multi-expense,
 *     lib/advice/question (reading the message) and lib/chat/cards + lib/chat/messages + lib/line/flex
 *     (the LINE messages), passed through withAppButton + presentReply exactly as handle-event does;
 *   - every write goes to the same FakePorchaiBackend the MINI App uses, so the dashboard shows what the chat did.
 * Differences from production, on purpose: no Gemini call (free text gets the bot's no-AI fallback reply; a
 * slip is "read" by a fixed OCR stub; «… ไหวไหม» is answered with the try card from the same flow instead of
 * the AI compare card), and the chat memory lives in this object.
 *
 * Habit reminders (Card 58): runReminderCron(now) does what app/api/cron/reminders + lib/db/reminders do every
 * 15 minutes — the user's settings, the habits found in their entries (lib/remind/habits findHabits/dueHabit,
 * the real rules), once per habit per day — and pushes the real reminderCard. Its buttons are handled like
 * handle-event.ts onReminderButton.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page, Route } from "@playwright/test";
import type { Entry, NewEntryRequest, Summary, UserCategory } from "../../../lib/api-types";
import type { BudgetResult } from "../../../lib/calc/budget";
import type { PorchaiApi } from "../../../lib/client/types";
import type { OcrDraft, ProposedItem, TryDraft } from "../../../lib/db/chat-memory";
import type { ReminderLog } from "../../../lib/db/reminders";
import { dueHabit, findHabits, type EntryForHabit } from "../../../lib/remind/habits";
import { amountOnly, categoryOf, parseExpense } from "../../../lib/chat/parse";
import { parseIntent } from "../../../lib/chat/actions/parse";
import { canSplitExpenses, splitExplicitExpenses } from "../../../lib/chat/multi-expense";
import { isBalanceQuestion, isQuestion, readQuestion } from "../../../lib/advice/question";
import {
  askNewAmountMessage,
  holdCard,
  howToRecordMessage,
  howToTryMessage,
  isUserCategory,
  notBuyingMessage,
  notWiredMessage,
  ocrCancelledMessage,
  ocrDraftCard,
  proposalCard,
  recordedCard,
  recordedManyCard,
  reminderAlreadyMessage,
  reminderCard,
  reminderEditMessage,
  reminderSkippedMessage,
  todayCard,
  tryCard,
  welcomeCard,
  type RecordedEntry,
} from "../../../lib/chat/cards";
import { askMessage, askTitleMessage, chatFallbackMessage, declinedMessage, keptMessage, type Draft } from "../../../lib/chat/messages";
import { buildRichMenuSpec, buildWelcomeCard } from "../../../lib/line/flex";
import { decodePostback } from "../../../lib/line/flex/postback";
import { presentReply } from "../../../lib/line/presentation";
import { text, withAppButton, type ReplyMessage } from "../../../lib/line/reply";
import { TODAY, type E2EUser, type FakePorchaiBackend } from "./liff-mock";

/** Route the chat page lives at (same origin as the MINI App, never served by Next). */
export const LINE_OA_PATH = "/__line-oa";

/** What the OCR stub "reads" from tests/fixtures/mock-slip.png (a sample slip, see generate-mock-slip.ts). */
export const DEMO_SLIP = { merchant: "ร้านเบอร์เกอร์", amount: 5000, kind: "expense" as const };

type ChatItem = { from: "user" | "bot"; message: unknown; at?: string }; // at: HH:mm shown on a pushed message
type Pending =
  | { kind: "edit"; entryId: string; title: string }
  | { kind: "ocr"; draftId: string; awaiting?: "amount" }
  | { kind: "items"; key: string; items: ProposedItem[] }
  | { kind: "reminder"; reminderId: string }
  | null;

type ChatEvent =
  | { type: "text"; text: string }
  | { type: "image"; src: string; name?: string; size?: number }
  | { type: "postback"; data: string; displayText?: string | null; label?: string | null };

const HTML = readFileSync(path.join(__dirname, "line-oa-chat.html"), "utf8");

export class DemoLineBot {
  readonly transcript: ChatItem[] = [];
  /** Every event the chat sent, with what the bot answered (for assertions and the report). */
  readonly log: { event: ChatEvent | { type: "follow" }; replies: string[] }[] = [];
  private pending: Pending = null;
  private readonly tries = new Map<string, TryDraft & { closed?: boolean }>();
  private readonly ocrDrafts = new Map<string, OcrDraft & { closed?: boolean }>();
  /** reminder_log: what was pushed today, by id; and the habit keys already reminded today (never twice). */
  readonly reminders = new Map<string, ReminderLog>();
  private readonly remindedKeys = new Set<string>();
  private seq = 0;
  private route?: { match: (url: URL) => boolean; handler: (route: Route) => Promise<void> };

  constructor(
    private readonly backend: FakePorchaiBackend,
    private readonly user: E2EUser,
  ) {}

  private get api(): PorchaiApi {
    return this.backend.as(this.user);
  }

  /** addEntry with the source the webhook records (lib/client/mock.ts accepts it as an extra argument). */
  private addEntry(req: NewEntryRequest, key: string, source: Entry["source"]) {
    return (this.api.addEntry as (r: NewEntryRequest, k: string, s: Entry["source"]) => ReturnType<PorchaiApi["addEntry"]>).call(this.api, req, key, source);
  }

  private eventId() {
    this.seq += 1;
    return `demo-evt-${String(this.seq).padStart(4, "0")}`;
  }

  /** Adding the OA as a friend: the C-1 welcome card (its button «เริ่มตั้งค่า ↗» opens /app/consent). */
  follow() {
    // Production's follow event sends welcomeCard() (the onboarding carousel); the C-1 card from the same
    // Flex library is the one with the single «เริ่มตั้งค่า» button the demo script asks for.
    const out = [present(buildWelcomeCard({}) as unknown as ReplyMessage)];
    this.push("bot", out);
    this.log.push({ event: { type: "follow" }, replies: out.map(altOf) });
  }

  /** Serves the chat page, its history and its webhook-like endpoint on this page. */
  async install(page: Page) {
    this.route = {
      match: (url) => url.pathname === LINE_OA_PATH || url.pathname.startsWith(`${LINE_OA_PATH}/`),
      handler: (route) => this.serve(route),
    };
    await page.route(this.route.match, this.route.handler);
  }

  /** Hands the chat page to another account's bot (the LINE app shows one user's chat at a time). */
  async uninstall(page: Page) {
    if (this.route) await page.unroute(this.route.match, this.route.handler);
    this.route = undefined;
  }

  /**
   * One run of the reminder cron at `now` (HH:mm, Thai time): if a habit is due it is pushed as the real
   * reminder card (withAppButton(reminderCard(log, time)), as app/api/cron/reminders sends it). Returns the
   * reminder pushed, or null (off, paused, nothing due, already reminded today, already recorded today).
   */
  async runReminderCron(now: string): Promise<ReminderLog | null> {
    const settings = await this.api.reminderSettings();
    if (!settings.enabled || (settings.pausedUntil !== null && settings.pausedUntil >= TODAY)) return null;
    const { entries } = await this.api.entries();
    const recent: EntryForHabit[] = (entries as Entry[]).map((e) => ({ note: e.note, amount: e.amount, category: e.category, spentOn: e.spentOn, createdAt: e.createdAt, source: e.source }));
    const habit = dueHabit(findHabits(recent, TODAY), recent.filter((e) => e.spentOn === TODAY), settings.time, now, this.remindedKeys);
    if (!habit) return null;
    const log: ReminderLog = { id: crypto.randomUUID(), label: habit.label, amount: habit.amount, category: habit.category, day: TODAY, status: "sent", entry_id: null };
    this.reminders.set(log.id, log);
    this.remindedKeys.add(habit.key);
    const out = [withAppButton(reminderCard(log, settings.time))];
    for (const message of out) this.transcript.push({ from: "bot", message, at: now });
    this.log.push({ event: { type: "follow" }, replies: out.map(altOf) });
    return log;
  }

  // ใช่ จดเลย / แก้ยอด → «60»: recorded once under the reminder (reminder:<id>), like recordReminder
  private async recordReminder(log: ReminderLog, amount: number): Promise<ReplyMessage> {
    if (log.status === "recorded") return reminderAlreadyMessage(log.label, amount);
    const { entry } = await this.addEntry({ amount, category: log.category, note: log.label, spentOn: log.day }, `reminder:${log.id}`, "reminder");
    log.status = "recorded";
    log.entry_id = entry.id;
    return this.recorded({ id: entry.id, title: log.label, amount: entry.amount, category: log.category });
  }

  private async serve(route: Route) {
    const url = new URL(route.request().url());
    if (url.pathname === LINE_OA_PATH) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HTML });
    if (url.pathname === `${LINE_OA_PATH}/history`) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: this.transcript, richMenu: buildRichMenuSpec() }) });
    }
    if (url.pathname === `${LINE_OA_PATH}/event` && route.request().method() === "POST") {
      const event = route.request().postDataJSON() as ChatEvent;
      const replies = await this.handle(event);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: replies }) });
    }
    return route.fulfill({ status: 404, body: "" });
  }

  private push(from: "user" | "bot", messages: unknown[]) {
    for (const message of messages) this.transcript.push({ from, message });
  }

  /** One chat event in, the bot's LINE messages out (already shaped like the real reply). */
  async handle(event: ChatEvent): Promise<ReplyMessage[]> {
    if (event.type === "text") this.push("user", [{ type: "text", text: event.text }]);
    else if (event.type === "image") this.push("user", [{ type: "image", src: event.src }]);
    else if (event.displayText) this.push("user", [{ type: "text", text: event.displayText }]);

    let answer: { message: ReplyMessage; heading?: string; pending?: Pending };
    if (event.type === "text") answer = await this.onText(event.text);
    else if (event.type === "image") answer = await this.onPhoto();
    else answer = await this.onPostback(event.data);
    this.pending = answer.pending ?? null;
    const out = [present(answer.message, answer.heading)];
    this.push("bot", out);
    this.log.push({ event: event.type === "image" ? { type: "image", src: `(${event.name ?? "image"}, ${event.size ?? 0} bytes)` } : event, replies: out.map(altOf) });
    return out;
  }

  // ------------------------------------------------------------------ text (handle-event.ts onText)

  private async onText(body: string): Promise<Answer> {
    const pending = this.pending;
    // Chat commands (lib/chat/actions): only the ones the demo uses are wired here.
    const intent = parseIntent(body, TODAY);
    if (intent?.tool === "claim_points") {
      const before = await this.api.points();
      const r = await this.api.claimPoints(`chat-daily:${TODAY}`);
      const created = !before.claimedToday;
      // Same words as lib/chat/actions/index.ts (claim_points), same heading
      return { message: text(`${created ? "รับ 1 แต้มแล้ว" : "รับแต้มวันนี้ไปแล้ว"} · มี ${r.balance} แต้มครับ`), heading: "เช็กแผนและแต้ม" };
    }
    if (intent) return { message: notWiredMessage() };

    const amount = amountOnly(body);
    // Card 58 [แก้ยอด] → «60»: record the reminded habit with the amount typed
    if (pending?.kind === "reminder" && amount !== null) {
      const log = this.reminders.get(pending.reminderId);
      if (log) return { message: await this.recordReminder(log, amount) };
    }
    // OCR [แก้ยอด] → «120»
    if (pending?.kind === "ocr" && pending.awaiting === "amount" && amount !== null) {
      const d = this.ocrDrafts.get(pending.draftId);
      if (d) return this.ocrDraftAnswer({ ...d, amount });
    }
    // Card 10 [แก้] → «65»: the new amount of that entry
    if (pending?.kind === "edit" && amount !== null) {
      const { entry } = await this.api.editEntry(pending.entryId, { amount });
      return { message: await this.recorded(asRecorded(entry), "แก้แล้ว ✓") };
    }

    if (isBalanceQuestion(body)) return { message: todayCard(await this.api.summary()) };

    const parsed = parseExpense(body);
    // «เสื้อช็อป 140 ไหวไหม»: a question with one price, answered and nothing saved
    if (isQuestion(body)) {
      const q = readQuestion(body);
      if (q.amount !== null) {
        const d: TryDraft = { id: crypto.randomUUID(), title: q.item ?? "รายการ", amount: q.amount, category: categoryOf(q.item ?? ""), key: this.eventId(), dueOn: null };
        return this.tryAnswer(d);
      }
      return { message: chatFallbackMessage(await this.api.summary()) };
    }
    if (parsed.kind === "income") return { message: notWiredMessage() }; // «รับ 500» is not part of the demo
    if (parsed.kind === "entry") return this.spend({ title: parsed.title, amount: parsed.amount, category: parsed.category, key: this.eventId() });
    if (parsed.reason === "no_title" && amount !== null) return { message: askTitleMessage(amount) };
    if (["too_large", "no_title", "income", "backdated"].includes(parsed.reason)) return { message: askMessage(parsed.reason) };
    if (parsed.reason === "many_amounts") {
      const { budget } = await this.api.summary();
      const items = canSplitExpenses(body) ? splitExplicitExpenses(body) : null;
      if (!items) return { message: askMessage("many_amounts") };
      const key = this.eventId();
      return { message: proposalCard(items, key, budget.kind === "ok" ? budget.todayRemaining : null), pending: { kind: "items", key, items } };
    }
    // No amount: production asks Gemini first; without it the bot answers with this fallback.
    return { message: chatFallbackMessage(await this.api.summary()) };
  }

  // L6: more than what is left today → ask first; otherwise record and answer with the recorded card
  private async spend(draft: Draft): Promise<Answer> {
    const { budget } = await this.api.summary();
    if (budget.kind === "ok" && budget.todayRemaining >= 0 && draft.amount > budget.todayRemaining) {
      return { message: holdCard(draft, budget.todayRemaining) };
    }
    const { entry } = await this.addEntry({ amount: draft.amount, category: draft.category as UserCategory, note: draft.title, spentOn: TODAY }, `line:${draft.key}`, "chat");
    return { message: await this.recorded({ id: entry.id, title: draft.title, amount: draft.amount, category: draft.category as UserCategory }) };
  }

  private async recorded(e: RecordedEntry, heading?: string): Promise<ReplyMessage> {
    const s = await this.api.summary();
    // "Tomorrow" only shows when today is overspent; the demo never overspends in the chat.
    return recordedCard(e, s, s.budget as BudgetResult, heading);
  }

  private async tryAnswer(d: TryDraft): Promise<Answer> {
    const r = await this.api.simulate({ amount: d.amount, dueOn: d.dueOn });
    this.tries.set(d.id, d);
    return { message: tryCard(d, r) };
  }

  // ------------------------------------------------------------------ photo (handle-event.ts onPhoto)

  private async onPhoto(): Promise<Answer> {
    // OCR stub: production sends the image to Gemini (lib/ocr/slip.ts). The demo slip always reads the same.
    const draft: OcrDraft = { id: crypto.randomUUID(), kind: DEMO_SLIP.kind, merchant: DEMO_SLIP.merchant, amount: DEMO_SLIP.amount, candidates: [DEMO_SLIP.amount], date: TODAY };
    return this.ocrDraftAnswer(draft);
  }

  private async ocrDraftAnswer(draft: OcrDraft): Promise<Answer> {
    this.ocrDrafts.set(draft.id, draft);
    const { entries } = await this.api.entries();
    const same = (entries as Entry[]).find((e) => e.spentOn === draft.date && e.amount === draft.amount) ?? null;
    return { message: ocrDraftCard(draft, TODAY, same), pending: { kind: "ocr", draftId: draft.id } };
  }

  // ------------------------------------------------------------------ buttons (handle-event.ts onPostback)

  private async onPostback(data: string): Promise<Answer> {
    if (data === "guide:all") return { message: welcomeCard() };
    const choice = readChoice(data);
    if (choice) {
      if (choice.action === "no") return { message: declinedMessage() };
      const p = this.pending;
      if (p?.kind !== "items" || p.key !== choice.key) return { message: notWiredMessage() };
      const entries: RecordedEntry[] = [];
      for (const [i, it] of p.items.entries()) {
        const { entry } = await this.addEntry({ amount: it.amount, category: it.category, note: it.title, spentOn: TODAY }, `line:${p.key}:${i}`, "chat");
        entries.push({ id: entry.id, title: it.title, amount: it.amount, category: it.category });
      }
      const s = await this.api.summary();
      return { message: recordedManyCard(entries, s, s.budget as BudgetResult) };
    }
    const p = decodePostback(data);
    if (!p) return { message: notWiredMessage() };
    if (p.action === "menu_today") return { message: todayCard(await this.api.summary()) };
    if (p.action === "menu_record") return { message: howToRecordMessage() };
    if (p.action === "menu_try") return { message: howToTryMessage() };
    if (p.action.startsWith("rem_")) {
      const log = this.reminders.get(p.id);
      if (!log) return { message: text("ไม่พบการเตือนนี้ครับ") };
      if (p.action === "rem_yes") return { message: await this.recordReminder(log, log.amount) };
      if (p.action === "rem_edit") return { message: reminderEditMessage(log), pending: { kind: "reminder", reminderId: log.id } };
      if (p.action === "rem_skip") {
        if (log.status !== "recorded") log.status = "skipped";
        return { message: reminderSkippedMessage(log, await this.api.summary()) };
      }
      return { message: text("ยกเลิกการแก้แล้วครับ ยังไม่ได้จดอะไร") };
    }
    if (p.action === "entry_edit") {
      const { entries } = await this.api.entries();
      const entry = (entries as Entry[]).find((e) => e.id === p.id);
      if (!entry) return { message: text("ไม่พบรายการนี้ อาจถูกลบไปแล้วครับ") };
      const e = asRecorded(entry);
      return { message: askNewAmountMessage(e), pending: { kind: "edit", entryId: e.id, title: e.title } };
    }
    if (p.action.startsWith("ocr_")) {
      const d = this.ocrDrafts.get(p.id);
      if (!d || d.closed) return { message: text("รายการนี้หมดเวลาแล้ว ส่งใหม่ได้เลยครับ") };
      if (p.action === "ocr_cancel") {
        d.closed = true;
        return { message: ocrCancelledMessage() };
      }
      if (p.action !== "ocr_save") return { message: notWiredMessage() };
      d.closed = true;
      const { entry } = await this.addEntry({ amount: d.amount, category: categoryOf(d.merchant), note: d.merchant, spentOn: d.date }, `ocr:${d.id}`, "ocr");
      return { message: await this.recorded(asRecorded(entry)) };
    }
    if (["keep_plan", "pay_real", "try_cancel", "try_other"].includes(p.action)) {
      const d = this.tries.get(p.id);
      if (!d || d.closed) return { message: text("รายการนี้หมดเวลาแล้ว ถามใหม่ได้เลยครับ") };
      if (p.action === "try_cancel") {
        d.closed = true;
        return { message: notBuyingMessage(d) };
      }
      if (p.action === "keep_plan") {
        d.closed = true;
        await this.api.addPlan({ kind: "purchase", title: d.title, amount: d.amount, dueOn: d.dueOn, category: d.category, status: "reserved" }, `line:${d.key}`);
        return { message: keptMessage({ title: d.title, amount: d.amount, category: d.category, key: d.key }, await this.api.summary()) };
      }
      return { message: notWiredMessage() };
    }
    return { message: notWiredMessage() };
  }
}

type Answer = { message: ReplyMessage; heading?: string; pending?: Pending };

// handle-event.ts: reply(token, [presentReply(withAppButton(message), heading)])
const present = (m: ReplyMessage, heading?: string) => presentReply(withAppButton(m), heading);
const altOf = (m: ReplyMessage) => (m.type === "text" ? m.text : m.altText);

const asRecorded = (e: { id: string; note: string | null; amount: number; category: string }): RecordedEntry => ({
  id: e.id,
  title: e.note ?? "รายการ",
  amount: e.amount,
  category: (isUserCategory(e.category) ? e.category : "other") as UserCategory,
});

function readChoice(data: string): { action: "all" | "no"; key: string } | null {
  try {
    const d = JSON.parse(data) as { a?: unknown; k?: unknown };
    if ((d.a !== "all" && d.a !== "no") || typeof d.k !== "string") return null;
    return { action: d.a, key: d.k };
  } catch {
    return null;
  }
}

export type { Summary };
