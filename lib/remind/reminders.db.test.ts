import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import type { ReplyMessage } from "@/lib/line/reply";
import { POST as webhook } from "@/app/api/line/webhook/route";
import { POST as createCycle } from "@/app/api/cycle/route";
import { GET as listEntries } from "@/app/api/entries/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/reminders/route";
import { POST as cron } from "@/app/api/cron/reminders/route";

// Card 58: settings (แอป › ตั้งค่า › การเตือน), the scheduler's run, the reminder card's buttons and the
// demo command. Only LINE itself (reply, push, ID token) is faked.

const replies: ReplyMessage[][] = [];
const pushes: { to: string; messages: ReplyMessage[]; retryKey: string }[] = [];
vi.mock("@/lib/line/reply", async (orig) => ({
  ...(await orig<typeof import("@/lib/line/reply")>()),
  reply: vi.fn(async (_token: string, messages: ReplyMessage[]) => {
    replies.push(messages);
  }),
}));
vi.mock("@/lib/line/push", () => ({
  push: vi.fn(async (to: string, messages: ReplyMessage[], retryKey: string) => {
    pushes.push({ to, messages, retryKey });
  }),
}));
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null) }));
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const secret = "test-secret";
const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_R_${run}`;
const lineB = `U_RB_${run}`;
const eventIds: string[] = [];
const today = () => thaiDate(new Date());

type Node = { type?: string; text?: string; contents?: Node[]; action?: { label: string; data?: string; type: string }; header?: Node; body?: Node; footer?: Node };
const textsOf = (n: Node | undefined): string[] =>
  !n ? [] : [n.text ?? "", ...[n.header, n.body, n.footer, ...(n.contents ?? [])].flatMap(textsOf)].filter(Boolean);
const buttonsOf = (n: Node | undefined): { label: string; data?: string; type: string }[] =>
  !n ? [] : [...(n.type === "button" && n.action ? [n.action] : []), ...[n.header, n.body, n.footer, ...(n.contents ?? [])].flatMap(buttonsOf)];
const flat = (m: ReplyMessage) => (m.type === "text" ? m.text : [m.altText, ...textsOf(m.contents as Node)].join(" "));
const buttons = (m: ReplyMessage) => [...(m.type === "flex" ? buttonsOf(m.contents as Node) : []), ...(m.quickReply?.items.map((i) => i.action) ?? [])];
const lastReply = () => replies.at(-1)![0];

function deliver(event: Record<string, unknown>) {
  const body = JSON.stringify({ events: [event] });
  return webhook(
    new Request("http://localhost/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": createHmac("sha256", secret).update(body).digest("base64") },
      body,
    }),
  );
}
function chat(text: string, line = lineA) {
  const id = `RE_${run}_${eventIds.length}`;
  eventIds.push(id);
  return deliver({ type: "message", webhookEventId: id, replyToken: `rt-${id}`, source: { type: "user", userId: line }, message: { type: "text", text } });
}
function tap(data: string, line = lineA) {
  const id = `RP_${run}_${eventIds.length}`;
  eventIds.push(id);
  return deliver({ type: "postback", webhookEventId: id, replyToken: `rt-${id}`, source: { type: "user", userId: line }, postback: { data } });
}

const auth = (line = lineA) => ({ Authorization: `Bearer ${line}` });

// Figma: 2,400 · bill 600 · savings 240 · buffer 120 · essentials 70 · 12 days → 120 a day
async function figma(line = lineA) {
  const res = await createCycle(
    new Request("http://localhost/api/cycle", {
      method: "POST",
      headers: auth(line),
      body: JSON.stringify({
        incomeSource: "family",
        incomeFrequency: "monthly",
        payday: addDays(today(), 12),
        balance: 240000,
        bills: [{ title: "ค่าหอ", amount: 60000 }],
        savingsPercent: 10,
        emergencyBuffer: 12000,
        essentials: { food: 5000, transport: 2000 },
      }),
    }),
  );
  expect(res.status).toBe(201);
}

async function userId(line = lineA) {
  const { data } = await db.from("users").select("id").eq("line_user_id", line).single();
  return data!.id as string;
}

// ข้าวเที่ยง 50 at 12:10 on the last 3 days → a habit (F2)
async function lunchHabit(line = lineA, title = "ข้าวเที่ยง") {
  const uid = await userId(line);
  const { data: cycle } = await db.from("cycles").select("id").eq("user_id", uid).eq("status", "active").single();
  const rows = [1, 2, 3].map((n) => {
    const day = addDays(today(), -n);
    return {
      user_id: uid,
      cycle_id: cycle!.id,
      amount: 5000,
      category: "food",
      note: title,
      spent_on: day,
      source: "chat",
      idempotency_key: `seed-${run}-${title}-${n}`,
      created_at: `${day}T05:10:00Z`, // 12:10 Thai
    };
  });
  expect((await db.from("entries").insert(rows)).error).toBeNull();
}

async function turnOn(line = lineA, body: Record<string, unknown> = { enabled: true, time: "12:30", pausedUntil: null }) {
  const res = await putSettings(new Request("http://localhost/api/reminders", { method: "PUT", headers: auth(line), body: JSON.stringify(body) }));
  return res;
}

const runCron = (key = "cron-secret") =>
  cron(new Request("http://localhost/api/cron/reminders", { method: "POST", headers: { Authorization: `Bearer ${key}` } }));

// Card 58's evidence: reminded / recorded / skipped
async function logStatuses(line = lineA) {
  const { data } = await db.from("reminder_log").select("status").eq("user_id", await userId(line));
  return data!.map((r) => r.status);
}

async function entries(line = lineA) {
  const res = await listEntries(new Request("http://localhost/api/entries", { headers: auth(line) }));
  return (await res.json()).entries as { amount: number; note: string; source: string }[];
}

// 13:00 Thai time today: after the usual 12:10 lunch and the 12:30 reminder (only Date is faked)
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${thaiDate(new Date())}T13:00:00+07:00`));
  replies.length = 0;
  pushes.length = 0;
  vi.stubEnv("LINE_CHANNEL_SECRET", secret);
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  vi.stubEnv("CRON_SECRET", "cron-secret");
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await db.from("line_events").delete().in("webhook_event_id", eventIds);
  await db.from("users").delete().in("line_user_id", [lineA, lineB]);
});

describe("settings — แอป › ตั้งค่า › การเตือน", () => {
  it("off at 12:30 until the user turns it on; the habits found are listed", async () => {
    await figma();
    await lunchHabit();
    const res = await getSettings(new Request("http://localhost/api/reminders", { headers: auth() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled: false,
      time: "12:30",
      pausedUntil: null,
      habits: [{ id: "ข้าวเที่ยง", label: "ข้าวเที่ยง", amount: 5000, time: "12:10" }],
    });
  });

  it("saves on / time / pause, and refuses a bad time or date", async () => {
    await figma();
    const res = await turnOn(lineA, { enabled: true, time: "13:00", pausedUntil: addDays(today(), 2) });
    expect(await res.json()).toMatchObject({ enabled: true, time: "13:00", pausedUntil: addDays(today(), 2) });
    expect((await turnOn(lineA, { enabled: true, time: "25:00", pausedUntil: null })).status).toBe(422);
    expect((await turnOn(lineA, { enabled: true, time: "12:30", pausedUntil: "tomorrow" })).status).toBe(422);
    expect((await turnOn(lineA, { enabled: "yes", time: "12:30", pausedUntil: null })).status).toBe(422);
  });

  it("needs the LINE login like every screen", async () => {
    const res = await getSettings(new Request("http://localhost/api/reminders"));
    expect(res.status).toBe(401);
  });
});

describe("the scheduler run (Supabase Cron → POST /api/cron/reminders)", () => {
  it("refuses without the secret, and when the server has none", async () => {
    expect((await runCron("wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await runCron("")).status).toBe(503);
  });

  it("F2: turned on, a habit, time passed, nothing recorded today → one push with the reminder card", async () => {
    await figma();
    await lunchHabit();
    await turnOn();
    const res = await runCron();
    expect(await res.json()).toEqual({ sent: 1 });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].to).toBe(lineA);
    const card = pushes[0].messages[0];
    expect(card.type).toBe("flex");
    expect(flat(card)).toContain("ข้าวเที่ยง");
    expect(flat(card)).toContain("50 บาท");
    expect(buttons(card).map((b) => b.label)).toEqual(expect.arrayContaining(["ใช่ จดเลย", "แก้ยอด", "วันนี้ไม่ได้ซื้อ"]));
  });

  it("runs every 15 minutes but reminds a habit once a day", async () => {
    await figma();
    await lunchHabit();
    await turnOn();
    await runCron();
    await runCron();
    expect(pushes).toHaveLength(1);
  });

  it("nothing when: turned off · paused · not enough history · already recorded today", async () => {
    await figma();
    await lunchHabit();
    await runCron(); // off by default
    await turnOn(lineA, { enabled: true, time: "12:30", pausedUntil: today() });
    await runCron(); // paused through today
    expect(pushes).toEqual([]);

    await figma(lineB);
    await turnOn(lineB);
    await runCron(); // no habit yet
    await lunchHabit(lineB);
    await chat("ข้าวเที่ยง 55", lineB);
    await runCron(); // recorded today
    expect(pushes).toEqual([]);
  });

  it("before the user's time: nothing yet", async () => {
    await figma();
    await lunchHabit();
    await turnOn(lineA, { enabled: true, time: "23:59", pausedUntil: null });
    await runCron();
    expect(pushes).toEqual([]);
  });
});

describe("the reminder card's buttons (โฟรวิว's card, card 58)", () => {
  async function reminded() {
    await figma();
    await lunchHabit();
    await turnOn();
    await runCron();
    // Back to the real clock for the taps: chat memory compares with the database's clock
    vi.useRealTimers();
    return buttons(pushes[0].messages[0]);
  }
  const data = (bs: { label: string; data?: string }[], label: string) => bs.find((b) => b.label === label)!.data!;

  it("F3 ใช่ จดเลย: records 50 once, as a reminder entry, and shows the recorded card", async () => {
    const bs = await reminded();
    await tap(data(bs, "ใช่ จดเลย"));
    expect(lastReply().type).toBe("flex");
    expect(flat(lastReply())).toContain("จดแล้ว ✓ ข้าวเที่ยง 50 บาท");
    await tap(data(bs, "ใช่ จดเลย"));
    const today_ = (await entries()).filter((x) => x.source === "reminder");
    expect(today_).toEqual([expect.objectContaining({ amount: 5000, note: "ข้าวเที่ยง" })]);
    expect(await logStatuses()).toEqual(["recorded"]);
  });

  it("แก้ยอด: asks the amount; «60» records 60 — and ใช่ จดเลย after that records nothing more", async () => {
    const bs = await reminded();
    await tap(data(bs, "แก้ยอด"));
    expect(flat(lastReply())).toContain("ข้าวเที่ยงจ่ายเท่าไหร่ครับ");
    await chat("60");
    expect(flat(lastReply())).toContain("จดแล้ว ✓ ข้าวเที่ยง 60 บาท");
    await tap(data(bs, "ใช่ จดเลย"));
    expect((await entries()).filter((x) => x.source === "reminder")).toEqual([expect.objectContaining({ amount: 6000 })]);
  });

  it("วันนี้ไม่ได้ซื้อ: nothing recorded, and not reminded again today", async () => {
    const bs = await reminded();
    await tap(data(bs, "วันนี้ไม่ได้ซื้อ"));
    expect(flat(lastReply())).toContain("วันนี้ไม่จดข้าวเที่ยง และไม่เตือนซ้ำวันนี้");
    expect(flat(lastReply())).toContain("120 บาท");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${thaiDate(new Date())}T13:00:00+07:00`)); // the next run, still due
    await runCron();
    expect(pushes).toHaveLength(1);
    expect((await entries()).filter((x) => x.source === "reminder")).toEqual([]);
    expect(await logStatuses()).toEqual(["skipped"]);
  });

  it("someone else's reminder id does nothing", async () => {
    const bs = await reminded();
    await figma(lineB);
    await tap(data(bs, "ใช่ จดเลย"), lineB);
    expect(flat(lastReply())).toContain("ไม่พบการเตือนนี้");
    expect(await entries(lineB)).toEqual([]);
  });
});

describe("demo command — the presenter cannot wait for 12:30", () => {
  it("«เดโมเตือน» answers with the reminder card at once, only with DEMO_MODE on", async () => {
    await figma();
    await lunchHabit();
    await chat("เดโมเตือน");
    expect(lastReply().type).toBe("text"); // DEMO_MODE off: just chat

    vi.stubEnv("DEMO_MODE", "1");
    await chat("เดโมเตือน");
    expect(lastReply().type).toBe("flex");
    expect(flat(lastReply())).toContain("ข้าวเที่ยง");
    expect(pushes).toEqual([]); // a reply, not a push: no quota
  });

  it("no habit yet: says what is needed", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    await figma();
    await chat("เดโมเตือน");
    expect(flat(lastReply())).toContain("3 วัน");
  });
});
