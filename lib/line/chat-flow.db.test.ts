import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import type { ReplyMessage } from "@/lib/line/reply";
import { POST as webhook } from "@/app/api/line/webhook/route";
import { POST as createCycle } from "@/app/api/cycle/route";
import { GET as listEntries } from "@/app/api/entries/route";

// 16 Nov exploratory run: conversations that got stuck or swallowed a message. End to end through the signed webhook.

const replies: ReplyMessage[][] = [];
vi.mock("@/lib/line/reply", async (orig) => ({
  ...(await orig<typeof import("@/lib/line/reply")>()),
  reply: vi.fn(async (_token: string, messages: ReplyMessage[]) => {
    replies.push(messages);
  }),
}));
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null) }));
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> => ({ ok: true, lineUserId: token })),
}));

const secret = "test-secret";
const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const line = `U_flow_${run}`;
const today = () => thaiDate(new Date());
let n = 0;

function chat(text: string) {
  const id = `F_${run}_${n++}`;
  const body = JSON.stringify({
    events: [{ type: "message", webhookEventId: id, replyToken: `rt-${id}`, source: { type: "user", userId: line }, message: { type: "text", text } }],
  });
  return webhook(
    new Request("http://localhost/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": createHmac("sha256", secret).update(body).digest("base64") },
      body,
    }),
  );
}

type Node = { text?: string; contents?: Node[]; header?: Node; body?: Node; footer?: Node };
const textsOf = (x: Node | undefined): string[] =>
  !x ? [] : [x.text ?? "", ...[x.header, x.body, x.footer, ...(x.contents ?? [])].flatMap(textsOf)].filter(Boolean);
const lastText = () => {
  const m = replies.at(-1)![0];
  return m.type === "text" ? m.text : [m.altText, ...textsOf(m.contents as Node)].join(" ");
};

async function cycle(balance: number, days: number) {
  const res = await createCycle(
    new Request("http://localhost/api/cycle", {
      method: "POST",
      headers: { Authorization: `Bearer ${line}` },
      body: JSON.stringify({
        incomeSource: "family", incomeFrequency: "monthly", payday: addDays(today(), days), balance,
        bills: [], emergencyBuffer: 0, essentials: { food: 5000, transport: 2000 },
      }),
    }),
  );
  expect(res.status).toBe(201);
}

async function entries() {
  const res = await listEntries(new Request("http://localhost/api/entries", { headers: { Authorization: `Bearer ${line}` } }));
  return (await res.json()).entries as { amount: number; note: string }[];
}

beforeEach(() => {
  replies.length = 0;
  vi.stubEnv("LINE_CHANNEL_SECRET", secret);
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await db.from("line_events").delete().like("webhook_event_id", `F_${run}_%`);
  await db.from("users").delete().eq("line_user_id", line);
});

describe("a finished chat command does not swallow the next message", () => {
  it("«วันนี้ใช้ได้เท่าไหร่» right after confirming an edit gets the budget card", async () => {
    await cycle(240000, 12);
    await chat("ข้าว 50");
    await chat("แก้ยอดล่าสุด 25 บาท");
    await chat("ยืนยัน");
    expect(lastText()).toContain("แก้ยอด ข้าว เป็น 25 บาท");
    await chat("วันนี้ใช้ได้เท่าไหร่");
    expect(lastText()).not.toContain("ยังไม่ได้ทำรายการ");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก");
  });

  it("a second «ยืนยัน» still says the request is done", async () => {
    await cycle(240000, 12);
    await chat("ข้าว 50");
    await chat("แก้ยอดล่าสุด 25 บาท");
    await chat("ยืนยัน");
    await chat("ยืนยัน");
    expect(lastText()).toContain("คำขอนี้จบแล้ว");
    expect((await entries())[0].amount).toBe(2500);
  });

  it("the demo script S01: the cycle set up in the chat, then «วันนี้ใช้ได้เท่าไหร่»", async () => {
    for (const t of ["เริ่มรอบเงิน", "เงินจากบ้าน", "รายเดือน", "3000", addDays(today(), 14), "300", "200", "50", "20", "ยืนยัน"]) await chat(t);
    expect(lastText()).toContain("เริ่มรอบเงินแล้ว");
    await chat("วันนี้ใช้ได้เท่าไหร่");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก");
  });
});

describe("the «เริ่มรอบเงิน» questions can be left", () => {
  it("an answer it cannot read says how to answer and how to leave", async () => {
    await chat("เริ่มรอบเงิน");
    await chat("แม่ให้");
    expect(lastText()).toContain("เงินหลักมาจากไหน");
    expect(lastText()).toContain("ยกเลิก");
  });

  it("a question in the middle leaves the setup and is answered", async () => {
    await chat("เริ่มรอบเงิน");
    await chat("เงินจากบ้าน");
    await chat("วันนี้ใช้ได้เท่าไหร่");
    expect(lastText()).not.toContain("รับเงินเป็นรอบแบบไหน");
    expect(lastText()).toContain("ยังไม่ได้ตั้งรอบเงิน");
    await chat("รายเดือน"); // no longer an answer to the setup
    expect(lastText()).not.toContain("มีเงินรวมจริงกี่บาท");
  });

  it("an expense in the middle leaves the setup", async () => {
    await chat("เริ่มรอบเงิน");
    await chat("ข้าว 50");
    expect(lastText()).not.toContain("เงินหลักมาจากไหน");
    expect(lastText()).toContain("ยังไม่ได้ตั้งรอบเงิน");
  });

  it("answers that look like money or a date stay in the setup", async () => {
    for (const t of ["เริ่มรอบเงิน", "เงินจากบ้าน", "รายเดือน", "3,000 บาท"]) await chat(t);
    expect(lastText()).toContain("วันรับเงินรอบถัดไป");
    await chat("30/11");
    expect(lastText()).toContain("วันรับเงินรอบถัดไป");
    await chat("-500");
    expect(lastText()).toContain("วันรับเงินรอบถัดไป");
    await chat(addDays(today(), 14));
    expect(lastText()).toContain("กันเงินออม");
  });
});

describe("the over-budget card (L6) can be confirmed by typing", () => {
  it("«ยืนยัน» records the held spend once", async () => {
    await cycle(30000, 10); // 300 baht, 10 days: 30 a day
    await chat("ชาบู 500");
    expect(lastText()).toContain("สูงกว่างบที่เหลือวันนี้");
    expect(await entries()).toEqual([]);
    await chat("ยืนยัน");
    expect(lastText()).toContain("ชาบู");
    expect(await entries()).toMatchObject([{ amount: 50000, note: "ชาบู" }]);
    await chat("ยืนยัน");
    expect(await entries()).toHaveLength(1);
  });

  it("another message first means «ยืนยัน» no longer records the old card", async () => {
    await cycle(30000, 10);
    await chat("ชาบู 500");
    await chat("วันนี้ใช้ได้เท่าไหร่");
    await chat("ยืนยัน");
    expect(await entries()).toEqual([]);
  });
});

describe("«1k» is a thousand", () => {
  it("«ข้าว 1k» is not 1 baht", async () => {
    await cycle(24000000, 12);
    await chat("ข้าว 1k");
    expect(await entries()).toMatchObject([{ amount: 100000, note: "ข้าว" }]);
  });
});

// ---------- medium (16 Nov) ----------

const userId = async () => (await db.from("users").select("id").eq("line_user_id", line).single()).data!.id as string;

describe("«เริ่มรอบเงิน» speaks Thai and checks the payday at once", () => {
  it("a payday that has passed is asked again right away, the answers so far kept", async () => {
    for (const t of ["เริ่มรอบเงิน", "ทุน", "รายเดือน", "3000"]) await chat(t);
    await chat("2020-01-01");
    expect(lastText()).toContain("วันเงินเข้าต้องเป็นวันหลังวันนี้");
    expect(lastText()).toContain("วันรับเงินรอบถัดไป");
    await chat(today());
    expect(lastText()).toContain("วันเงินเข้าต้องเป็นวันหลังวันนี้");
    await chat(addDays(today(), 14));
    expect(lastText()).toContain("กันเงินออม");
  });

  it("the summary names the source and frequency in Thai", async () => {
    for (const t of ["เริ่มรอบเงิน", "งานพิเศษ", "รายสัปดาห์", "3000", addDays(today(), 7), "0", "0", "0", "0"]) await chat(t);
    expect(lastText()).toContain("งานพิเศษ · รายสัปดาห์");
    expect(lastText()).not.toMatch(/side_job|weekly|family|monthly/);
  });
});

describe("bills from the chat", () => {
  it("«เพิ่มบิล ค่าไฟ 500 วันที่ 20» keeps the day, and «ดูบิล» shows the status in Thai", async () => {
    await cycle(240000, 40);
    await chat("เพิ่มบิล ค่าไฟ 500 วันที่ 20");
    expect(lastText()).not.toContain("ไม่กำหนดวัน");
    await chat("ยืนยัน");
    const plan = (await db.from("plans").select("title,due_on").eq("user_id", await userId()).single()).data!;
    expect(plan.title).toBe("ค่าไฟ");
    expect(plan.due_on).toMatch(/-20$/);
    await chat("ดูบิล");
    expect(lastText()).toContain("ค่าไฟ");
    expect(lastText()).not.toMatch(/reserved|postponed/);
  });
});

describe("unclear money in is asked, a name alone asks the amount", () => {
  it.each(["ทอนเงินมา 20", "ถูกหวย 1000"])("«%s» records nothing", async (t) => {
    await cycle(240000, 12);
    await chat(t);
    expect(lastText()).toContain("ได้รับเงิน");
    expect(await entries()).toEqual([]);
  });

  it("«ข้าวมันไก่» asks how much, then «45» records it (AI off)", async () => {
    await cycle(240000, 12);
    await chat("ข้าวมันไก่");
    expect(lastText()).toContain("กี่บาท");
    await chat("45");
    expect(await entries()).toMatchObject([{ amount: 4500, note: "ข้าวมันไก่" }]);
  });
});

describe("«ไหวไหม» then buying it", () => {
  // 2,400 baht, 12 days, food + transport 70 a day: 200 a day, 1,560 to spare
  it("after «ไหว ✓», the same item and price is recorded at once, and the card said it is over today", async () => {
    await cycle(240000, 12);
    await chat("ชาบู 250 ไหวไหม");
    expect(lastText()).toContain("ไหว");
    expect(lastText()).toContain("เกินงบวันนี้ 50 บาท");
    await chat("ชาบู 250");
    expect(lastText()).not.toContain("สูงกว่างบที่เหลือวันนี้");
    expect(await entries()).toMatchObject([{ amount: 25000, note: "ชาบู" }]);
    await chat("ชาบู 250"); // a second one is its own spend (today is over already, so recorded: L6)
    expect(await entries()).toHaveLength(2);
  });

  it("without asking first it is held as before", async () => {
    await cycle(240000, 12);
    await chat("ชาบู 250");
    expect(lastText()).toContain("สูงกว่างบที่เหลือวันนี้");
    expect(await entries()).toEqual([]);
  });

  it("after «ไม่พอ», it is held as before", async () => {
    await cycle(240000, 12);
    await chat("รองเท้า 2000 ไหวไหม");
    await chat("รองเท้า 2000");
    expect(lastText()).toContain("สูงกว่างบที่เหลือวันนี้");
    expect(await entries()).toEqual([]);
  });

  it("the not-enough card names each number for what it is", async () => {
    await cycle(240000, 12);
    await chat("รองเท้า 3000 ไหวไหม"); // 1,440 over what can be bought; 600 short of the 2,400 itself
    expect(lastText()).toContain("เกินที่ซื้อได้ 1,440 บาท");
    expect(lastText()).not.toMatch(/เกินงบ \d/);
    expect(lastText()).toContain("ไม่พอกันบิล เงินออม และเงินเผื่อ");
  });
});

// ---------- small (16 Nov) ----------

describe("questions and commands that got «ตอบไม่ได้»", () => {
  it("«พรุ่งนี้ใช้ได้เท่าไหร่» says tomorrow's budget", async () => {
    await cycle(240000, 12); // 200 a day
    await chat("ข้าว 90");
    await chat("พรุ่งนี้ใช้ได้เท่าไหร่");
    expect(lastText()).toContain("พรุ่งนี้ใช้ได้วันละ 210 บาท"); // (2,400 − 90) ÷ 11 days
  });

  it("«ปีนี้ใช้ไปเท่าไร» says where to look instead", async () => {
    await cycle(240000, 12);
    await chat("ปีนี้ใช้ไปเท่าไร");
    expect(lastText()).toContain("ดูรายงานเดือนนี้");
    expect(lastText()).not.toContain("ตอบข้อความนี้ไม่ได้");
  });

  it.each(["ห้าสิบ", "ข้าวห้าสิบบาท", "ชาเย็นสองร้อย"])("«%s» asks for the amount in digits (AI off)", async (t) => {
    await cycle(240000, 12);
    await chat(t);
    expect(lastText()).toContain("ขอยอดเป็นตัวเลข");
    expect(lastText()).not.toContain("กี่บาท");
    expect(await entries()).toEqual([]);
  });

  it("«ค้นหา ข้าว» finds it, with Thai dates", async () => {
    await cycle(240000, 12);
    await chat("ข้าว 45");
    await chat("ค้นหา ข้าว");
    expect(lastText()).toContain("พบ 1 รายการ");
    expect(lastText()).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("«วิเคราะห์» shows Thai dates", async () => {
    await cycle(240000, 12);
    await chat("วิเคราะห์");
    expect(lastText()).toContain("วิเคราะห์รายการที่จด");
    expect(lastText()).not.toMatch(/\d{4}-\d{2}-\d{2}|ไม่รวมวันสุดท้าย/);
  });

  it("«ตั้งเตือน 20:00» saves the reminder", async () => {
    await cycle(240000, 12);
    await chat("ตั้งเตือน 20:00");
    if (/ยืนยัน/.test(lastText())) await chat("ยืนยัน");
    const saved = await db.from("reminder_settings").select("enabled,remind_at").eq("user_id", await userId()).maybeSingle();
    expect(saved.data).toMatchObject({ enabled: true });
    expect(String(saved.data?.remind_at)).toMatch(/^20:00/);
  });
});
