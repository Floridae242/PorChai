import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import { generate } from "@/lib/ai/gemini";
import type { VerifyResult } from "@/lib/line/id-token";
import type { ReplyMessage } from "@/lib/line/reply";
import { POST as webhook } from "@/app/api/line/webhook/route";
import { POST as createCycle } from "@/app/api/cycle/route";
import { GET as listEntries } from "@/app/api/entries/route";

// Card 09: «ข้าว 50» in the chat → recorded straight away; unclear → asked; over today's budget → held (Figma L6).
// End to end through the signed webhook; only LINE itself (reply + ID token check) is faked.

const replies: { token: string; messages: ReplyMessage[] }[] = [];
vi.mock("@/lib/line/reply", async (orig) => ({
  ...(await orig<typeof import("@/lib/line/reply")>()),
  reply: vi.fn(async (token: string, messages: ReplyMessage[]) => {
    replies.push({ token, messages });
  }),
}));
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null) })); // AI off: rules + template
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const secret = "test-secret";
const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const eventIds: string[] = [];
const today = () => thaiDate(new Date());

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

function chat(text: string, webhookEventId = `E_${run}_${eventIds.length}`) {
  eventIds.push(webhookEventId);
  return deliver({
    type: "message",
    webhookEventId,
    replyToken: `rt-${webhookEventId}`,
    source: { type: "user", userId: lineA },
    message: { type: "text", text },
  });
}

function tap(data: string) {
  const webhookEventId = `P_${run}_${eventIds.length}`;
  eventIds.push(webhookEventId);
  return deliver({
    type: "postback",
    webhookEventId,
    replyToken: `rt-${webhookEventId}`,
    source: { type: "user", userId: lineA },
    postback: { data },
  });
}

// A Flex card reads as its altText plus every text in it (card 10: the recorded card)
type Action = { type: string; label: string; data?: string; uri?: string };
type Node = { type?: string; text?: string; contents?: Node[]; action?: Action; header?: Node; body?: Node; footer?: Node };
const textsOf = (n: Node | undefined): string[] =>
  !n ? [] : [n.text ?? "", ...[n.header, n.body, n.footer, ...(n.contents ?? [])].flatMap(textsOf)].filter(Boolean);
const buttonsOf = (n: Node | undefined): Action[] =>
  !n ? [] : [...(n.type === "button" && n.action ? [n.action] : []), ...[n.header, n.body, n.footer, ...(n.contents ?? [])].flatMap(buttonsOf)];
const last = () => replies.at(-1)!.messages[0];
const lastText = () => {
  const m = last();
  return m.type === "text" ? m.text : [m.altText, ...textsOf(m.contents as Node)].join(" ");
};
// Card buttons first, then the quick replies above the keyboard
const lastButtons = (): Action[] => {
  const m = last();
  const quick = m.quickReply?.items.map((i) => i.action) ?? [];
  return m.type === "flex" ? [...buttonsOf(m.contents as Node), ...quick] : quick;
};

// Figma: 2,400 · bill 600 · savings 240 · buffer 120 · essentials 70 · 12 days → 120 a day
async function figma() {
  const res = await createCycle(
    new Request("http://localhost/api/cycle", {
      method: "POST",
      headers: { Authorization: `Bearer ${lineA}` },
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

// What the LIFF screens see for the same LINE account (card 06)
async function screenEntries() {
  const res = await listEntries(new Request("http://localhost/api/entries", { headers: { Authorization: `Bearer ${lineA}` } }));
  return (await res.json()).entries;
}

describe("card 09: expenses from the chat", () => {
  beforeEach(() => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  it("L2: «ข้าว 45» is recorded at once and the reply says 75 left today — and it shows on the LIFF screens (card 06)", async () => {
    await figma();
    expect((await chat("ข้าว 45")).status).toBe(200);
    expect(last().type).toBe("flex"); // card 10: โฟรวิว's recorded card
    expect(lastText()).toContain("จดแล้ว ✓ ข้าว 45 บาท");
    expect(lastText()).toContain("อาหาร");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 75 บาท");
    expect(lastText()).toContain("ใช้ไปแล้ว 45 / 120 บาท");
    expect(lastText()).toContain("ยังเหลืออีกเยอะ ใช้ได้สบาย ๆ"); // a friendly last line, no AI

    expect(await screenEntries()).toEqual([
      expect.objectContaining({ amount: 4500, category: "food", note: "ข้าว", source: "chat", spentOn: today() }),
    ]);
  });

  it("LINE delivering the same message twice records it once", async () => {
    await figma();
    await chat("ข้าว 45", `E_${run}_dup`);
    await db.from("line_events").delete().eq("webhook_event_id", `E_${run}_dup`); // as if the first handling failed
    await chat("ข้าว 45", `E_${run}_dup`);
    expect(await screenEntries()).toHaveLength(1);
  });

  it("09: unclear messages are asked back (AI off), with a button to the app; nothing is recorded", async () => {
    await figma();
    const cases: [string, string, string][] = [
      ["ข้าว", "ผมชื่อพอใช้", "เปิดแอป"],
      ["Hey", "ผมชื่อพอใช้", "เปิดแอป"],
      ["ข้าว 50 น้ำ 20", "ทีละรายการ", "กรอกเองในแอป"],
      ["ข้าวร้อยกว่า", "ยอดที่จ่ายจริง", "กรอกเองในแอป"],
      ["50", "ค่าอะไร", "กรอกเองในแอป"],
    ];
    for (const [text, says, label] of cases) {
      await chat(text);
      expect(lastText()).toContain(says);
      expect(lastButtons()).toContainEqual(expect.objectContaining({ type: "uri", label }));
    }
    expect(await screenEntries()).toEqual([]);
  });

  it("adding the OA as a friend: a welcome with a button to the app (MINI App link when the app is a MINI App)", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545254-6025ZG1r");
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "2012545254");
    eventIds.push(`F_${run}`);
    await deliver({ type: "follow", webhookEventId: `F_${run}`, replyToken: "rt-f", source: { type: "user", userId: lineA } });
    expect(last().type).toBe("flex"); // โฟรวิว's welcome card
    expect(lastText()).toContain("สวัสดีครับ ฉันคือพอใช้");
    expect(lastButtons()).toEqual([
      { type: "uri", label: "เริ่มตั้งค่า ↗", uri: "https://miniapp.line.me/2012545254-6025ZG1r/consent" },
      { type: "uri", label: "เปิดแอป", uri: "https://miniapp.line.me/2012545254-6025ZG1r" },
    ]);
  });

  it("the app link stays a LIFF link when the app is the LIFF app", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545176-udYyTUiA");
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "2012545254");
    await chat("Hey");
    expect(lastButtons()).toEqual([expect.objectContaining({ uri: "https://liff.line.me/2012545176-udYyTUiA" })]);
  });

  it("before setup: asks to set up the cycle first, records nothing", async () => {
    await chat("ข้าว 45");
    expect(lastText()).toContain("ยังไม่ได้ตั้งรอบเงิน");
  });

  it("L6: «ชาบู 350» is over today's 120 → held, not recorded, with ยืนยันจ่ายจริง / ลองก่อนซื้อ", async () => {
    await figma();
    await chat("ชาบู 350");
    expect(last().type).toBe("flex"); // hold card
    expect(lastText()).toContain("350 บาท สูงกว่างบที่เหลือวันนี้ (120 บาท)");
    expect(lastButtons().map((b) => b.label)).toEqual(["ยืนยันจ่ายจริง", "ลองก่อนซื้อ", "เปิดแอป"]);
    expect(await screenEntries()).toEqual([]);
  });

  it("L6: ยืนยันจ่ายจริง records it once — 230 over today, tomorrow 99 a day; a second tap records nothing", async () => {
    await figma();
    await chat("ชาบู 350");
    const pay = lastButtons().find((b) => b.label === "ยืนยันจ่ายจริง")!;
    const data = (pay as { data: string }).data;

    await tap(data);
    expect(lastText()).toContain("จดแล้ว ✓ ชาบู 350 บาท");
    expect(lastText()).toContain("เกินงบ 230 บาท");
    expect(lastText()).toContain("พรุ่งนี้ใช้ได้ 120 → 99 บาท/วัน");
    expect(lastText()).toContain("ไม่เป็นไรครับ งบพรุ่งนี้ปรับให้แล้ว");

    await tap(data);
    expect(lastText()).toContain("จดไว้แล้ว");
    expect(await screenEntries()).toHaveLength(1);
  });

  it("already over today's budget: the next item is recorded at once, and the reply shows what it does to tomorrow", async () => {
    await figma();
    await chat("ชาบู 350");
    await tap((lastButtons().find((b) => b.label === "ยืนยันจ่ายจริง") as { data: string }).data);

    await chat("น้ำ 10");
    expect(lastText()).toContain("จดแล้ว ✓ น้ำ 10 บาท");
    expect(lastText()).toContain("เกินงบ 240 บาท");
    expect(lastText()).toContain("พรุ่งนี้ใช้ได้ 120 → 98 บาท/วัน"); // (1,440 − 360) ÷ 11
    expect(await screenEntries()).toHaveLength(2);
  });

  it("within today's budget the reply does not talk about tomorrow", async () => {
    await figma();
    await chat("ข้าว 45");
    expect(lastText()).not.toContain("พรุ่งนี้");
  });

  it("the friendly last line follows how much of today is left", async () => {
    await figma();
    await chat("ข้าว 80"); // 40 of 120 left
    expect(lastText()).toContain("เหลือไม่มากแล้ว ค่อย ๆ ใช้นะ");
    await chat("ข้าว 40"); // exactly 0 left
    expect(lastText()).toContain("พอดีงบวันนี้เป๊ะ");
  });

  it("L6: ลองก่อนซื้อ shows the try and saves nothing", async () => {
    await figma();
    await chat("ชาบู 350");
    const tryIt = lastButtons().find((b) => b.label === "ลองก่อนซื้อ") as { data: string };
    await tap(tryIt.data);
    expect(last().type).toBe("flex"); // โฟรวิว's try-before-buy card
    expect(lastText()).toContain("เหลือวันละ 90.75 บาท"); // (1,440 − 350) ÷ 12 = 90.83 → 90.75 (R3-quarter)
    // a meal today: pay, try another price, or not buy
    expect(lastButtons().map((b) => b.label).slice(0, 3)).toEqual(["ยืนยันจ่ายจริง", "ลองยอดอื่น", "ไม่ซื้อ"]);
    expect(await screenEntries()).toEqual([]);
  });

  it("a malformed or forged button payload does nothing", async () => {
    await figma();
    await tap("not json");
    await tap(JSON.stringify({ a: "pay", t: "x", m: -5, c: "food", k: "k1" }));
    await tap(JSON.stringify({ a: "pay", t: "x", m: 100, c: "bills", k: "k1" }));
    expect(await screenEntries()).toEqual([]);
  });

  it("a failed reply does not lose the spend or make LINE redeliver", async () => {
    await figma();
    const { reply } = await import("@/lib/line/reply");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(reply).mockRejectedValueOnce(new Error("LINE down"));
    expect((await chat("ข้าว 45")).status).toBe(200);
    expect(await screenEntries()).toHaveLength(1);
    vi.mocked(console.error).mockRestore();
  });
});

describe("card 15: questions in the chat", () => {
  beforeEach(() => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  async function plans() {
    const { data: u } = await db.from("users").select("id").eq("line_user_id", lineA).single();
    const { data } = await db.from("plans").select("title, amount, status, due_on").eq("user_id", u!.id).eq("kind", "purchase");
    return data!;
  }
  const button = (label: string) => lastButtons().find((b) => b.label === label) as { data: string };

  it("«พรุ่งนี้กินชาบู 300 ไหวไหม» is answered, not recorded; for tomorrow only เก็บไว้ในแผน is offered", async () => {
    await figma();
    await chat("พรุ่งนี้กินชาบู 300 ไหวไหม");
    expect(last().type).toBe("flex"); // โฟรวิว's AI compare card
    expect(lastText()).toContain("ชาบู (พรุ่งนี้) 300 บาท");
    expect(lastText()).toContain("ไหว ✓"); // the explanation (template: AI off)
    expect(lastButtons().map((b) => b.label).slice(0, 3)).toEqual(["เก็บไว้ในแผน", "ยืนยันจ่ายจริง", "ลองยอดอื่น"]);
    await tap(button("ยืนยันจ่ายจริง").data); // not today: keep it instead
    expect(lastText()).toContain("ยังไม่ถึงวัน");
    expect(await screenEntries()).toEqual([]);
  });

  it("เก็บไว้ในแผน holds it for tomorrow once; a second tap holds nothing more", async () => {
    await figma();
    await chat("พรุ่งนี้กินชาบู 300 ไหวไหม");
    const keep = button("เก็บไว้ในแผน").data;
    await tap(keep);
    expect(lastText()).toContain("เก็บไว้ในแผนแล้ว ✓ ชาบู 300 บาท");
    await tap(keep);
    expect(await plans()).toEqual([{ title: "ชาบู", amount: 30000, status: "reserved", due_on: addDays(today(), 1) }]);
  });

  it("kept, then paid from the same answer → the plan is paid; money is taken once", async () => {
    await figma();
    await chat("ซื้อหูฟัง 500 ได้ไหม");
    expect(lastButtons().map((b) => b.label)).toEqual(expect.arrayContaining(["ยืนยันจ่ายจริง", "เก็บไว้ในแผน"]));
    const pay = button("ยืนยันจ่ายจริง").data;
    await tap(button("เก็บไว้ในแผน").data);
    await tap(pay);
    expect(await plans()).toEqual([expect.objectContaining({ status: "paid" })]);
    expect(await screenEntries()).toEqual([expect.objectContaining({ amount: 50000, source: "plan" })]);
  });

  it("paid, then kept from the same answer → nothing is held on top", async () => {
    await figma();
    await chat("ซื้อหูฟัง 500 ได้ไหม");
    const keep = button("เก็บไว้ในแผน").data;
    await tap(button("ยืนยันจ่ายจริง").data);
    await tap(keep);
    expect(lastText()).toContain("จดไว้แล้ว");
    expect(await plans()).toEqual([]);
    expect(await screenEntries()).toHaveLength(1);
  });

  it("bug 13 Nov: «ถ้ากิน ชาบู 150 บาท จะเหลือเงินใช้วันละเท่าไร» is a try, never a spend", async () => {
    await figma();
    await chat("ถ้ากิน ชาบู 150 บาท จะเหลือเงินใช้วันละเท่าไร");
    expect(lastText()).toContain("ชาบู");
    expect(lastText()).toContain("150 บาท");
    expect(lastText()).not.toContain("จดแล้ว");
    expect(await screenEntries()).toEqual([]);
  });

  it("a question without a price never turns into «จ่ายไปกี่บาท?» — the answer is not recorded", async () => {
    await figma();
    vi.mocked(generate).mockResolvedValueOnce(JSON.stringify({ intent: "spend", topic: "money", item: "ชาบู", reply: "" }));
    await chat("ถ้ากินชาบูจะเหลือเท่าไร");
    expect(lastText()).toContain("ชาบู ราคาเท่าไรครับ");
    expect(lastText()).not.toContain("จ่ายไป");
    await chat("150");
    expect(await screenEntries()).toEqual([]);
  });

  it("a question with two prices is not split into spends either", async () => {
    await figma();
    vi.mocked(generate).mockResolvedValue(JSON.stringify({ items: [{ title: "ชาบู", amount_baht: 150 }, { title: "ชาบู", amount_baht: 200 }] }));
    await chat("ถ้ากินชาบู 150 หรือ 200 จะเหลือเท่าไร");
    expect(lastButtons().map((b) => b.label)).not.toContain("จดทั้งหมด");
    expect(await screenEntries()).toEqual([]);
    vi.mocked(generate).mockReset().mockResolvedValue(null);
  });

  it("a question with no price goes to the chat: the AI asks for the price (AI off: the template)", async () => {
    await figma();
    vi.mocked(generate).mockResolvedValueOnce(JSON.stringify({ intent: "chat", topic: "money", item: null, reply: "ชาบูราคาเท่าไรเอ่ย?" }));
    await chat("ชาบูไหวไหม");
    expect(lastText()).toBe("ชาบูราคาเท่าไรเอ่ย?");
    await chat("ชาบูไหวไหม");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
  });
});

describe("card 15: chatting with the AI (rules first, AI only when they cannot read it)", () => {
  beforeEach(() => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
    vi.mocked(generate).mockReset().mockResolvedValue(null);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  const aiSays = (o: object) => vi.mocked(generate).mockResolvedValueOnce(JSON.stringify(o));
  const button = (label: string) => lastButtons().find((b) => b.label === label) as { data: string };
  async function memory() {
    const { data: u } = await db.from("users").select("id").eq("line_user_id", lineA).single();
    const { data } = await db.from("chat_messages").select("role, body").eq("user_id", u!.id).order("id");
    return data!;
  }

  it("«Hey»: the AI's reply, and both sides are remembered", async () => {
    await figma();
    aiSays({ intent: "chat", topic: "money", item: null, reply: "สวัสดี! วันนี้ใช้ได้อีก 120 บาทนะ" });
    await chat("Hey");
    expect(lastText()).toBe("สวัสดี! วันนี้ใช้ได้อีก 120 บาทนะ");
    expect(await memory()).toEqual([
      { role: "user", body: "Hey" },
      { role: "bot", body: "สวัสดี! วันนี้ใช้ได้อีก 120 บาทนะ" },
    ]);
  });

  it("the AI is sent the chat and the numbers only — never the LINE id", async () => {
    await figma();
    await chat("ข้าว 45");
    await chat("เหลือเท่าไร");
    const input = vi.mocked(generate).mock.calls.at(-1)![0].input;
    expect(input).not.toContain(lineA);
    expect(JSON.parse(input)).toMatchObject({
      facts: { setUp: true, todayRemaining: 75, dailyBudget: 120 },
      history: [{ role: "user", text: "ข้าว 45" }, { role: "bot" }],
      message: "เหลือเท่าไร",
    });
  });

  it("AI off or a reply with a made-up number → the template: who the bot is and what is left today (no list of 3 things)", async () => {
    await figma();
    await chat("Hey");
    expect(lastText()).toContain("สวัสดี");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
    expect(lastText()).toContain("ผมชื่อพอใช้ ผู้ช่วยเรื่องเงินของคุณ");
    expect(lastText()).not.toContain("3 อย่าง");
    aiSays({ intent: "chat", topic: "money", item: null, reply: "เหลือ 999 บาทจ้า" });
    await chat("เหลือเท่าไร");
    expect(lastText()).not.toContain("999");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
  });

  it("«เหลือกี่บาท?» is chat, not a try-before-you-buy question", async () => {
    await figma();
    await chat("เหลือกี่บาท?");
    expect(lastText()).not.toContain("อยากซื้ออะไร");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
  });

  it("off topic: never the AI's words — a fixed reply bringing it back to money", async () => {
    await figma();
    aiSays({ intent: "chat", topic: "other", item: null, reply: "การบ้านข้อนี้ตอบ ข" });
    await chat("ช่วยทำการบ้านหน่อย");
    expect(lastText()).not.toContain("การบ้านข้อนี้");
    expect(lastText()).toContain("ถามเรื่องเงิน");
    expect(await screenEntries()).toEqual([]);
  });

  it("before setup the template says to set up first", async () => {
    await chat("Hey");
    expect(lastText()).toContain("ยังไม่ได้ตั้งรอบเงิน");
  });

  it("«ข้าว» → asked how much → «45» is recorded", async () => {
    await figma();
    aiSays({ intent: "spend", topic: "money", item: "ข้าว", reply: "" });
    await chat("ข้าว");
    expect(lastText()).toContain("ข้าว จ่ายไปกี่บาท");
    await chat("45");
    expect(lastText()).toContain("จดแล้ว ✓ ข้าว 45 บาท");
    expect(await screenEntries()).toEqual([expect.objectContaining({ amount: 4500, note: "ข้าว", source: "chat" })]);
  });

  it("«ข้าวร้อยกว่า» → asked for the real amount → «120» is recorded", async () => {
    await figma();
    aiSays({ intent: "spend", topic: "money", item: "ข้าว", reply: "" });
    await chat("ข้าวร้อยกว่า");
    expect(lastText()).toContain("ยอดที่จ่ายจริง");
    await chat("120 บาท");
    expect(await screenEntries()).toEqual([expect.objectContaining({ amount: 12000, note: "ข้าว" })]);
  });

  it("the remembered item counts only for the very next message", async () => {
    await figma();
    aiSays({ intent: "spend", topic: "money", item: "ข้าว", reply: "" });
    await chat("ข้าว");
    await chat("Hey");
    await chat("45");
    expect(lastText()).toContain("ค่าอะไร");
    expect(await screenEntries()).toEqual([]);
  });

  it("over today's budget the follow-up is held like «ชาบู 350» (L6)", async () => {
    await figma();
    aiSays({ intent: "spend", topic: "money", item: "ชาบู", reply: "" });
    await chat("ชาบู");
    await chat("350");
    expect(lastText()).toContain("350 บาท สูงกว่างบที่เหลือวันนี้ (120 บาท)");
    expect(await screenEntries()).toEqual([]);
  });

  it("«45» → asked what for → «ข้าว» is recorded (no AI needed)", async () => {
    await figma();
    await chat("45");
    expect(lastText()).toContain("45 บาท ค่าอะไร");
    await chat("ข้าว");
    expect(lastText()).toContain("จดแล้ว ✓ ข้าว 45 บาท");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
  });

  it("«ข้าว 45» is still the rules' job: recorded without asking the AI", async () => {
    await figma();
    await chat("ข้าว 45");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(lastText()).toContain("จดแล้ว ✓ ข้าว 45 บาท");
  });

  it("several spends: the AI proposes, [จดทั้งหมด] records each once", async () => {
    await figma();
    aiSays({ items: [{ title: "ข้าว", amount_baht: 45 }, { title: "น้ำ", amount_baht: 20 }] });
    await chat("ข้าว 45 น้ำ 20");
    expect(last().type).toBe("flex"); // proposal card
    expect(lastText()).toContain("เจอ 2 รายการ รวม 65 บาท");
    for (const t of ["ข้าว", "45 บาท", "น้ำ", "20 บาท", "อาหาร"]) expect(lastText()).toContain(t);
    expect(lastButtons().map((b) => b.label)).toEqual(["จดทั้งหมด", "ไม่ใช่", "กรอกเองในแอป", "เปิดแอป"]);
    expect(await screenEntries()).toEqual([]);

    const all = button("จดทั้งหมด").data;
    await tap(all);
    expect(last().type).toBe("flex"); // โฟรวิว's recorded card with 2 items (Figma L10)
    expect(lastText()).toContain("จดแล้ว ✓ 2 รายการ");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 55 บาท");
    await tap(all);
    expect(lastText()).toContain("จดไว้แล้ว");
    expect((await screenEntries()).map((e: { amount: number }) => e.amount).sort()).toEqual([2000, 4500]);
  });

  it("[ไม่ใช่] records nothing", async () => {
    await figma();
    aiSays({ items: [{ title: "ข้าว", amount_baht: 45 }, { title: "น้ำ", amount_baht: 20 }] });
    await chat("ข้าว 45 น้ำ 20");
    await tap(button("ไม่ใช่").data);
    expect(lastText()).toContain("ไม่จด");
    expect(await screenEntries()).toEqual([]);
  });

  it("over today's budget: says so before the tap, and the tap records anyway", async () => {
    await figma();
    aiSays({ items: [{ title: "ชาบู", amount_baht: 300 }, { title: "น้ำ", amount_baht: 20 }] });
    await chat("ชาบู 300 น้ำ 20");
    expect(lastText()).toContain("เกินงบที่เหลือวันนี้ (120 บาท) อยู่ 200 บาท");
    await tap(button("จดทั้งหมด").data);
    expect(await screenEntries()).toHaveLength(2);
  });

  it("an AI split with an amount nobody typed is not offered — asked one at a time", async () => {
    await figma();
    aiSays({ items: [{ title: "ข้าว", amount_baht: 65 }] });
    await chat("ข้าว 45 น้ำ 20");
    expect(lastText()).toContain("ทีละรายการ");
    expect(lastButtons().map((b) => b.label)).not.toContain("จดทั้งหมด");
  });

  it("a [จดทั้งหมด] for a proposal no longer remembered records nothing", async () => {
    await figma();
    await tap(JSON.stringify({ a: "all", k: "never-proposed" }));
    expect(lastText()).toContain("หมดเวลา");
    expect(await screenEntries()).toEqual([]);
  });
});

describe("card 10: the recorded card's buttons (โฟรวิว's Flex card, wired here)", () => {
  beforeEach(() => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
    vi.mocked(generate).mockReset().mockResolvedValue(null);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().in("line_user_id", [lineA, `${lineA}_other`]);
  });

  const data = (label: string) => (lastButtons().find((b) => b.label === label) as { data: string }).data;

  it("the card's buttons point at the saved entry: [แก้] [เปลี่ยนหมวด] [ลบ], then เปิดแผน / วันนี้ใช้ได้ / เปิดแอป", async () => {
    await figma();
    await chat("ข้าว 45");
    const [entry] = await screenEntries();
    expect(lastButtons().map((b) => b.label)).toEqual(["แก้", "เปลี่ยนหมวด", "ลบ", "เปิดแผน", "วันนี้ใช้ได้", "เปิดแอป"]);
    expect(data("ลบ")).toBe(`v1.entry_del.${entry.id}`);
  });

  it("L9 เปลี่ยนหมวด: four categories as quick replies; picking one changes it", async () => {
    await figma();
    await chat("ข้าว 45");
    await tap(data("เปลี่ยนหมวด"));
    expect(lastButtons().map((b) => b.label)).toEqual(["อาหาร", "เดินทาง", "ของใช้", "อื่น ๆ", "เปิดแอป"]);
    await tap(data("เดินทาง"));
    expect(lastText()).toContain("เปลี่ยนหมวดแล้วครับ ✓ ข้าว 45 บาท → เดินทาง");
    expect(await screenEntries()).toEqual([expect.objectContaining({ category: "transport" })]);
  });

  it("ลบ asks first; ลบเลย removes it once and says what is left today", async () => {
    await figma();
    await chat("ข้าว 45");
    await tap(data("ลบ"));
    expect(lastText()).toContain("ลบ ข้าว 45 บาท ใช่ไหมครับ");
    expect(await screenEntries()).toHaveLength(1); // nothing yet
    const ok = data("ลบเลย");
    await tap(ok);
    expect(lastText()).toContain("ลบแล้วครับ ✓ ข้าว 45 บาท");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
    expect(await screenEntries()).toEqual([]);
    await tap(ok);
    expect(lastText()).toContain("ลบไปแล้ว");
  });

  it("แก้: asks for the new amount; «50» changes it and shows the card again", async () => {
    await figma();
    await chat("ข้าว 45");
    await tap(data("แก้"));
    expect(lastText()).toContain("พิมพ์ยอดใหม่ของ ข้าว");
    expect(lastButtons()).toContainEqual(expect.objectContaining({ type: "uri", label: "แก้ในแอป" }));
    await chat("50");
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("แก้แล้ว ✓ ข้าว 50 บาท");
    expect(await screenEntries()).toEqual([expect.objectContaining({ amount: 5000 })]); // still one entry
  });

  it("วันนี้ใช้ได้: today's budget card", async () => {
    await figma();
    await chat("ข้าว 45");
    await tap(data("วันนี้ใช้ได้"));
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("75 บาท");
  });

  it("someone else's entry id in a forged button changes nothing", async () => {
    await figma();
    await chat("ข้าว 45");
    const [entry] = await screenEntries();
    const other = `${lineA}_other`;
    eventIds.push(`X_${run}`);
    await deliver({
      type: "postback",
      webhookEventId: `X_${run}`,
      replyToken: "rt-x",
      source: { type: "user", userId: other },
      postback: { data: `v1.entry_del_ok.${entry.id}` },
    });
    expect(lastText()).toContain("ไม่พบรายการนี้");
    expect(await screenEntries()).toHaveLength(1);
  });

  it("a card button not wired yet says so instead of doing nothing", async () => {
    await figma();
    await tap("v1.bill_paid.abc"); // OCR buttons are wired now
    expect(lastText()).toContain("ปุ่มนี้ยังใช้ไม่ได้");
  });

  it("several at once ([จดทั้งหมด]): the recorded card lists them, without [แก้] [ลบ] (they fit one entry only)", async () => {
    await figma();
    vi.mocked(generate).mockResolvedValueOnce(JSON.stringify({ items: [{ title: "ข้าว", amount_baht: 45 }, { title: "น้ำ", amount_baht: 20 }] }));
    await chat("ข้าว 45 น้ำ 20");
    await tap(data("จดทั้งหมด"));
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("จดแล้ว ✓ 2 รายการ");
    expect(lastButtons().map((b) => b.label)).not.toEqual(expect.arrayContaining(["แก้"]));
    expect(lastButtons().map((b) => b.label)).not.toEqual(expect.arrayContaining(["ลบ"]));
  });
});

describe("rich menu (โฟรวิว's spec and image) and what the bot cannot record yet", () => {
  beforeEach(() => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
    vi.mocked(generate).mockReset().mockResolvedValue(null);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  it("จดรายรับ/จ่าย: how to record — only what works («ข้าว 45», «รับ 500»; no «เมื่อวาน»)", async () => {
    await figma();
    await tap("v1.menu_record.richmenu");
    expect(lastText()).toContain("«ข้าว 45»");
    expect(lastText()).toContain("«รับ 500»");
    expect(lastText()).not.toContain("เมื่อวาน");
    expect(lastButtons()).toContainEqual(expect.objectContaining({ type: "uri", label: "กรอกในแอป" }));
  });

  it("ลองก่อนจ่าย: how to ask, with the app's try screen", async () => {
    await figma();
    await tap("v1.menu_try.richmenu");
    expect(lastText()).toContain("ไหวไหม");
    expect(lastButtons()).toContainEqual(expect.objectContaining({ type: "uri", label: "ลองในแอป" }));
  });

  it("วันนี้ใช้ได้ from the menu: today's card", async () => {
    await figma();
    await tap("v1.menu_today.richmenu");
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("120 บาท");
  });

  it("«รับ 500» is income, never a spend: money on hand +500, a day 120 → 161.50; LINE redelivering it adds it once", async () => {
    await figma();
    await chat("รับ 500", `E_${run}_income`);
    expect(last().type).toBe("flex"); // income card
    expect(lastText()).toContain("รับเงินแล้ว ✓ +500 บาท");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 161.50 บาท");
    await db.from("line_events").delete().eq("webhook_event_id", `E_${run}_income`); // as if handling failed
    await chat("รับ 500", `E_${run}_income`);
    expect(await screenEntries()).toEqual([]); // not a spend
    const { data: u } = await db.from("users").select("id").eq("line_user_id", lineA).single();
    const { data } = await db.from("incomes").select("amount").eq("user_id", u!.id);
    expect(data).toEqual([{ amount: 50000 }]);
  });

  it("«รับ» with no amount asks how much", async () => {
    await figma();
    await chat("รับ");
    expect(lastText()).toContain("รับ 500");
  });

  it("«เมื่อวาน ข้าว 45» is not recorded as today: nothing recorded, pointed to the app", async () => {
    await figma();
    for (const t of ["เมื่อวาน ข้าว 45", "ข้าว 45 เมื่อวาน", "เมื่อคืน ชาบู 300"]) {
      await chat(t);
      expect(lastText(), t).toContain("ย้อนหลัง");
    }
    expect(await screenEntries()).toEqual([]);
  });
});

describe("every answer has [เปิดแอป] above the keyboard (phone 13 Nov: sometimes it was not there)", () => {
  beforeEach(() => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
    vi.mocked(generate).mockReset().mockResolvedValue(null);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  const quick = () => last().quickReply?.items.map((i) => i.action.label) ?? [];

  it("text, card and button answers alike — once, never twice", async () => {
    await figma();
    const answers: string[][] = [];
    await chat("ข้าว 45"); // recorded card (its own quick replies: เปิดแผน / วันนี้ใช้ได้)
    answers.push(quick());
    const del = (lastButtons().find((b) => b.label === "ลบ") as { data: string }).data;
    await tap(del); // ask to delete (only ลบเลย before)
    answers.push(quick());
    await tap("v1.bill_paid.abc"); // OCR buttons are wired now // not wired yet (no buttons before)
    answers.push(quick());
    await chat("Hey"); // template (already had เปิดแอป)
    answers.push(quick());
    for (const labels of answers) {
      expect(labels.filter((l) => l === "เปิดแอป")).toHaveLength(1);
    }
  });
});


describe("โฟรวิว's try cards: their buttons (ลองยอดอื่น · ไม่ซื้อ · เลื่อนไปรอบหน้า)", () => {
  beforeEach(() => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
    vi.mocked(generate).mockReset().mockResolvedValue(null);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().in("line_user_id", [lineA, `${lineA}_other`]);
  });

  const data = (label: string) => (lastButtons().find((b) => b.label === label) as { data: string }).data;
  async function tryCard(text: string) {
    await figma();
    await chat(text);
    await tap(data("ลองก่อนซื้อ"));
  }
  async function myPlans() {
    const { data: u } = await db.from("users").select("id").eq("line_user_id", lineA).single();
    const { data: p } = await db.from("plans").select("title, amount, status").eq("user_id", u!.id).eq("kind", "purchase");
    return p!;
  }

  it("ลองยอดอื่น: «250» tries again — 1,190 ÷ 12 = 99.16 → 99 a day; nothing saved", async () => {
    await tryCard("ชาบู 350");
    await tap(data("ลองยอดอื่น"));
    expect(lastText()).toContain("พิมพ์ราคาใหม่");
    await chat("250");
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("เหลือวันละ 99 บาท");
    expect(await screenEntries()).toEqual([]);
  });

  it("ไม่ซื้อ: nothing saved, and its buttons do nothing afterwards", async () => {
    await tryCard("ชาบู 350");
    const pay = data("ยืนยันจ่ายจริง");
    await tap(data("ไม่ซื้อ"));
    expect(lastText()).toContain("ไม่ซื้อ");
    await tap(pay);
    expect(await screenEntries()).toEqual([]);
  });

  it("not a meal: เลื่อนไปรอบหน้า keeps it as a postponed plan, held nothing this cycle", async () => {
    await tryCard("หูฟัง 700");
    expect(lastButtons().map((b) => b.label).slice(0, 3)).toEqual(["เก็บไว้ในแผน", "ยืนยันจ่ายจริง", "เลื่อนไปรอบหน้า"]);
    await tap(data("เลื่อนไปรอบหน้า"));
    expect(lastText()).toContain("เลื่อนไปรอบหน้าแล้ว ✓ หูฟัง 700 บาท");
    expect(await myPlans()).toEqual([{ title: "หูฟัง", amount: 70000, status: "postponed" }]);
  });

  it("ยืนยันจ่ายจริง from the try card records it once", async () => {
    await tryCard("ชาบู 350");
    const pay = data("ยืนยันจ่ายจริง");
    await tap(pay);
    expect(lastText()).toContain("จดแล้ว ✓ ชาบู 350 บาท");
    await tap(pay);
    expect(await screenEntries()).toHaveLength(1);
  });

  it("someone else's draft id does nothing", async () => {
    await tryCard("ชาบู 350");
    const pay = data("ยืนยันจ่ายจริง");
    const other = `${lineA}_other`;
    eventIds.push(`Y_${run}`);
    await deliver({ type: "postback", webhookEventId: `Y_${run}`, replyToken: "rt-y", source: { type: "user", userId: other }, postback: { data: pay } });
    expect(lastText()).toContain("หมดเวลา");
    expect(await screenEntries()).toEqual([]);
  });
});
