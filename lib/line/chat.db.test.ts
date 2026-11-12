import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import { generate } from "@/lib/ai/gemini";
import type { VerifyResult } from "@/lib/line/id-token";
import type { TextMessage } from "@/lib/line/reply";
import { POST as webhook } from "@/app/api/line/webhook/route";
import { POST as createCycle } from "@/app/api/cycle/route";
import { GET as listEntries } from "@/app/api/entries/route";

// Card 09: «ข้าว 50» in the chat → recorded straight away; unclear → asked; over today's budget → held (Figma L6).
// End to end through the signed webhook; only LINE itself (reply + ID token check) is faked.

const replies: { token: string; messages: TextMessage[] }[] = [];
vi.mock("@/lib/line/reply", async (orig) => ({
  ...(await orig<typeof import("@/lib/line/reply")>()),
  reply: vi.fn(async (token: string, messages: TextMessage[]) => {
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

const lastText = () => replies.at(-1)!.messages[0].text;
const lastButtons = () => replies.at(-1)!.messages[0].quickReply?.items.map((i) => i.action) ?? [];

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
    expect(lastText()).toContain("จดแล้ว ✓ ข้าว 45 บาท (อาหาร)");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 75 บาท · ใช้ไปแล้ว 45 / 120");
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
      ["ข้าว", "พิมพ์ชื่อกับยอด", "เปิดแอป"],
      ["Hey", "พิมพ์ชื่อกับยอด", "เปิดแอป"],
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
    expect(lastText()).toContain("ยินดีต้อนรับสู่พอใช้");
    expect(lastButtons()).toEqual([{ type: "uri", label: "เปิดแอป", uri: "https://miniapp.line.me/2012545254-6025ZG1r" }]);
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
    expect(lastText()).toContain("350 บาท สูงกว่างบที่เหลือวันนี้ (120 บาท)");
    expect(lastButtons().map((b) => b.label)).toEqual(["ยืนยันจ่ายจริง", "ลองก่อนซื้อ"]);
    expect(await screenEntries()).toEqual([]);
  });

  it("L6: ยืนยันจ่ายจริง records it once — 230 over today, tomorrow 99 a day; a second tap records nothing", async () => {
    await figma();
    await chat("ชาบู 350");
    const pay = lastButtons().find((b) => b.label === "ยืนยันจ่ายจริง")!;
    const data = (pay as { data: string }).data;

    await tap(data);
    expect(lastText()).toContain("จดแล้ว ✓ ชาบู 350 บาท (อาหาร)");
    expect(lastText()).toContain("เกินงบวันนี้ 230 บาท");
    expect(lastText()).toContain("พรุ่งนี้ใช้ได้ 99 บาท/วัน (เดิม 120)");
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
    expect(lastText()).toContain("จดแล้ว ✓ น้ำ 10 บาท (อาหาร)");
    expect(lastText()).toContain("เกินงบวันนี้ 240 บาท");
    expect(lastText()).toContain("พรุ่งนี้ใช้ได้ 98 บาท/วัน (เดิม 120)"); // (1,440 − 360) ÷ 11
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
    expect(lastText()).toContain("ไม่ซื้อ → วันละ 120 บาท");
    expect(lastText()).toContain("ซื้อ → เหลือวันละ 90.75 บาท"); // (1,440 − 350) ÷ 12 = 90.83 → 90.75 (R3-quarter)
    expect(lastText()).toContain("ค่ากินค่ารถยังพอทุกวัน");
    expect(lastButtons().map((b) => b.label)).toContain("ยืนยันจ่ายจริง");
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
    expect(lastText()).toContain("ไหว ✓ ชาบู 300 บาท (พรุ่งนี้)");
    expect(lastButtons().map((b) => b.label)).toEqual(["เก็บไว้ในแผน", "เปิดแอป"]);
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
    expect(lastButtons().map((b) => b.label)).toEqual(["ยืนยันจ่ายจริง", "เก็บไว้ในแผน", "เปิดแอป"]);
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

  it("a question with no price goes to the chat: the AI asks for the price (AI off: the template's example)", async () => {
    await figma();
    vi.mocked(generate).mockResolvedValueOnce(JSON.stringify({ intent: "chat", topic: "money", item: null, reply: "ชาบูราคาเท่าไรเอ่ย?" }));
    await chat("ชาบูไหวไหม");
    expect(lastText()).toBe("ชาบูราคาเท่าไรเอ่ย?");
    await chat("ชาบูไหวไหม");
    expect(lastText()).toContain("«ชาบู 300 ไหวไหม»");
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

  it("AI off or a reply with a made-up number → the template: hello, what is left today, 3 things it can do", async () => {
    await figma();
    await chat("Hey");
    expect(lastText()).toContain("สวัสดี");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
    expect(lastText()).toContain("«ข้าว 45»");
    expect(lastText()).toContain("ไหวไหม");
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
    expect(lastText()).toContain("จดแล้ว ✓ ข้าว 45 บาท (อาหาร)");
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
    expect(lastText()).toContain("จดแล้ว ✓ ข้าว 45 บาท (อาหาร)");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
  });

  it("«ข้าว 45» is still the rules' job: recorded without asking the AI", async () => {
    await figma();
    await chat("ข้าว 45");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(lastText()).toContain("จดแล้ว ✓ ข้าว 45 บาท (อาหาร)");
  });

  it("several spends: the AI proposes, [จดทั้งหมด] records each once", async () => {
    await figma();
    aiSays({ items: [{ title: "ข้าว", amount_baht: 45 }, { title: "น้ำ", amount_baht: 20 }] });
    await chat("ข้าว 45 น้ำ 20");
    expect(lastText()).toContain("• ข้าว 45 บาท (อาหาร)");
    expect(lastText()).toContain("• น้ำ 20 บาท (อาหาร)");
    expect(lastText()).toContain("รวม 65 บาท");
    expect(lastButtons().map((b) => b.label)).toEqual(["จดทั้งหมด", "ไม่ใช่", "กรอกเองในแอป"]);
    expect(await screenEntries()).toEqual([]);

    const all = button("จดทั้งหมด").data;
    await tap(all);
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
