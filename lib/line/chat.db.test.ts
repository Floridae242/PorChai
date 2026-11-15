import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import { generate } from "@/lib/ai/gemini";
import * as installmentsDb from "@/lib/db/installments";
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
  const actions: Action[] = m.type === "flex" ? [...buttonsOf(m.contents as Node), ...quick] : quick;
  // A footer and keyboard may expose the same logical action; verify its payload once.
  return [...new Map(actions.map((a) => [JSON.stringify([a.type, a.label, a.data, a.uri]), a])).values()];
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
  it.each(["ขอวิธีใช้","ขอวิธีจดรายรับ 1000 บาท","จดข้าว 50 ยังไงครับ","ขอวิธีผ่อนโทรศัพท์","ทำยังไงถึงได้แต้ม"])("asking how to use never records examples or awards points: %s",async body=>{
    await figma();expect((await chat(body)).status).toBe(200);expect(last().type).toBe("flex");expect(await screenEntries()).toEqual([]);
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();
    expect((await db.from("incomes").select("id").eq("user_id",owner.data!.id)).data).toEqual([]);expect((await db.from("points_ledger").select("id").eq("user_id",owner.data!.id)).data).toEqual([]);
  });
  it("help interrupts pending expense amounts without allowing a later bare number to save the old item",async()=>{
    await figma();await chat("ข้าว");expect(lastText()).toContain("กี่บาท");await chat("ขอวิธีจด");expect(lastText()).toContain("ยังไม่ได้บันทึกหรือเปลี่ยนข้อมูล");await chat("50");expect(await screenEntries()).toEqual([]);
  });
  it("help interrupts a pending bill form or confirmation without mutating either",async()=>{
    await figma();await chat("เพิ่มบิล ค่าไฟ");await chat("ขอวิธีผ่อน");await chat("100");
    await chat("กันเงินเผื่อ 200 บาท");await chat("ขอวิธีใช้เงินเผื่อ");await chat("ยืนยัน");
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();expect((await db.from("cycles").select("emergency_buffer").eq("user_id",owner.data!.id).single()).data!.emergency_buffer).toBe(12000);
    expect((await db.from("plans").select("title").eq("user_id",owner.data!.id)).data).toEqual([{title:"ค่าหอ"}]);
  });
  it("help interrupts entry editing and the common help button reopens the carousel",async()=>{
    await figma();await chat("ข้าว 45");const edit=lastButtons().find(b=>b.label==="แก้")!.data!;await tap(edit);await chat("ลบรายการยังไง");await chat("60");expect((await screenEntries())[0].amount).toBe(4500);
    const help=lastButtons().find(b=>b.data==="guide:all")!.data!;await tap(help);const m=last();if(m.type!=="flex" || m.contents.type!=="carousel")throw Error("carousel required");expect(m.contents.contents).toHaveLength(10);
  });
  it("a daily expense automatically awards a point before any manual claim",async()=>{
    await figma();await chat("ข้าว 45");await chat("ดูแต้ม");expect(lastText()).toContain("1 แต้ม");await chat("เช็กครบแล้ว");expect(lastText()).toContain("รับแต้มวันนี้ไปแล้ว");expect(lastText()).toContain("1 แต้ม");
  });
  it("creates a personal category and records into it only after confirmation",async()=>{
    await figma();await chat("เพิ่มหมวด ชานม กลุ่ม อาหาร งบ 500 บาท");expect(lastText()).toContain("ยืนยัน");await chat("ยืนยัน");expect(lastText()).toContain("บันทึกหมวด ชานม");
    await chat("จด ชานม 50 หมวด ชานม");expect(lastText()).toContain("ยืนยัน");expect(await screenEntries()).toEqual([]);await chat("ยืนยัน");
    const entries=await screenEntries();expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({amount:5000,category:"food"});expect(entries[0].categoryId).toBeTruthy();
    await chat("วิเคราะห์");expect(lastText()).toContain("1 รายการ");await chat("ดูภาพรวม");expect(lastText()).toContain("50 บาท");
  });
  it("clear newline-separated expenses need one confirmation and award one daily point",async()=>{
    await figma();const calls=vi.mocked(generate).mock.calls.length;await chat("ข้าว 45\nรถเมล์ 20");
    expect(vi.mocked(generate).mock.calls.length).toBe(calls);const button=lastButtons().find(b=>b.label === "จดทั้งหมด")!.data!;
    await tap(button);await tap(button);expect((await screenEntries()).map((e:{amount:number})=>e.amount).sort()).toEqual([2000,4500]);
    await chat("ดูแต้ม");expect(lastText()).toContain("1 แต้ม");
  });
  it("mixed income and expense lines are clarified instead of silently becoming expenses",async()=>{
    await figma();await chat("รับเงิน 1000\nข้าว 50");expect(await screenEntries()).toEqual([]);
  });
  it("the reported sentence proposes all three items with AI off and confirmation is idempotent",async()=>{
    await figma();
    await chat("กินปลาหมึกย่าง 70 บาท น้ำส้มอีก 30 บาท ซูชิอีก 30 บาท");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(lastText()).toContain("เจอ 3 รายการ รวม 130 บาท");
    for(const title of ["ปลาหมึกย่าง","น้ำส้ม","ซูชิ"]) expect(lastText()).toContain(title);
    expect(await screenEntries()).toEqual([]);
    const confirm=lastButtons().find(b=>b.label==="จดทั้งหมด")!.data!;
    await tap(confirm);await tap(confirm);
    expect((await screenEntries()).map((e:{amount:number})=>e.amount).sort((a:number,b:number)=>a-b)).toEqual([3000,3000,7000]);
    await chat("ดูแต้ม");expect(lastText()).toContain("1 แต้ม");
  });
  it("declining the reported multi-item sentence saves nothing",async()=>{
    await figma();await chat("กินปลาหมึกย่าง 70 บาท น้ำส้มอีก 30 บาท ซูชิอีก 30 บาท");
    await tap(lastButtons().find(b=>b.label==="ไม่ใช่")!.data!);
    expect(await screenEntries()).toEqual([]);
  });

  it("creates installments only after confirmation and never books the purchase total as a spend",async()=>{
    await figma();await chat(`ผ่อน โทรศัพท์ ยอดรวม 1000.01 บาท 3 งวด เริ่ม ${today()}`);
    expect(lastText()).toContain("ยืนยัน");expect(lastText()).toContain("333.34 บาท");expect(await screenEntries()).toEqual([]);
    const confirm=lastButtons().find(b=>b.label === "ยืนยัน")!.data!;await tap(confirm);await tap(confirm);
    expect(lastText()).toContain("จบแล้ว");
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();
    const rows=await db.from("plans").select("amount").eq("user_id",owner.data!.id).like("title","โทรศัพท์ · งวด %");
    expect(rows.data).toHaveLength(3);expect(rows.data!.reduce((sum,row)=>sum+row.amount,0)).toBe(100001);expect(await screenEntries()).toEqual([]);
  });
  it.each([
    "ผ่อน โทรศัพท์ 12000 12 งวด", "ผ่อน โทรศัพท์ ยอดรวม -100 บาท 2 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 0 งวด เริ่ม 2026-12-01", "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 61 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2 งวด เริ่ม 2026-02-30", "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2 งวด เริ่ม 2020-01-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2.5 งวด เริ่ม 2026-12-01", "ผ่อน โทรศัพท์ ยอดรวม 1.999 บาท 2 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ดาวน์ 1000 บาท 12 งวด", "ผ่อน โทรศัพท์ ดอกเบี้ย 0% ยอดรวม 100 บาท 2 งวด เริ่ม 2026-12-01",
    "ผ่อน โทรศัพท์ ยอดรวม 100 บาท 2 งวด เริ่ม 2026-12-01 ไหวไหม", "ฉันไม่ได้ผ่อนโทรศัพท์ 500 บาท",
  ])("invalid or unclear installment message never falls through to expense recording: %s",async message=>{
    await figma();expect((await chat(message)).status).toBe(200);expect(await screenEntries()).toEqual([]);
    expect(lastButtons().some(b=>b.label === "ยืนยัน")).toBe(false);
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();
    expect((await db.from("plans").select("id").eq("user_id",owner.data!.id)).data).toHaveLength(1);
  });
  it("an installment affordability question is a calculator preview, never a saved bill",async()=>{
    await figma();await chat(`ผ่อน โทรศัพท์ ยอดรวม 30000 บาท 3 งวด เริ่ม ${today()} ไหวไหม`);
    expect(lastText()).toContain("ยังไม่ได้สร้างบิล");expect(lastText()).toContain("เงินขาด");expect(await screenEntries()).toEqual([]);
    expect(lastButtons().some(b=>b.label === "ยืนยัน")).toBe(false);
  });
  it("installments beyond the first ten remain payable through paginated chat lists",async()=>{
    await figma();await chat(`ผ่อน โทรศัพท์ ยอดรวม 12000 บาท 12 งวด เริ่ม ${today()}`);await chat("ยืนยัน");
    await chat("ดูแผน หน้า 2");expect(lastText()).toContain("หน้า 2");expect(lastText()).toContain("งวด 10/12");
    await chat("จ่ายบิล 1 หน้า 2");expect(lastText()).toContain("งวด 10/12");await chat("ยืนยัน");
    expect((await screenEntries()).map((e:{amount:number})=>e.amount)).toEqual([100000]);
  });
  it("a transport error after commit can retry the same card without duplicate installment bills",async()=>{
    await figma();await chat(`ผ่อน โทรศัพท์ ยอดรวม 1000.01 บาท 3 งวด เริ่ม ${today()}`);
    const button=lastButtons().find(b=>b.label === "ยืนยัน")!.data!,original=installmentsDb.addInstallments;
    const spy=vi.spyOn(installmentsDb,"addInstallments").mockImplementationOnce(async(...args)=>{await original(...args);throw new Error("simulated lost RPC response");});
    try{expect((await tap(button)).status).toBe(500);expect((await tap(button)).status).toBe(200);expect(lastText()).toContain("สร้างบิลผ่อน");}
    finally{spy.mockRestore();}
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();
    expect((await db.from("plans").select("id").eq("user_id",owner.data!.id).like("title","โทรศัพท์ · งวด %")).data).toHaveLength(3);
  });

  it("«ได้รับเงิน 1000 บาท» records income directly in LINE, not an expense or app redirect",async()=>{
    await figma();expect((await chat("ได้รับเงิน 1000 บาท")).status).toBe(200);
    expect(await screenEntries()).toEqual([]);
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();expect(owner.error).toBeNull();
    const incomes=await db.from("incomes").select("amount,source").eq("user_id",owner.data!.id);expect(incomes.error).toBeNull();expect(incomes.data).toEqual([{amount:100000,source:"chat"}]);expect(lastText()).toContain("1,000");
  });
  it("reads a real daily report and searches the user's entries inside LINE",async()=>{
    await figma();await chat("ข้าว 45");await chat("ดูรายงานวันนี้");expect(lastText()).toContain("รายงานวันนี้");expect(lastText()).toContain("45 บาท");
    await chat("ค้นรายจ่าย ข้าว");expect(lastText()).toContain("พบ 1 รายการ");expect(lastText()).toContain("ข้าว");
  });
  it("notification opt-in in chat is a proposal until confirmed",async()=>{
    await figma();await chat("เปิดสรุปรายวัน เวลา 20:00");expect(lastText()).toContain("ยืนยัน");
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();
    expect((await db.from("notification_preferences").select("daily").eq("user_id",owner.data!.id)).data).toEqual([]);
    expect((await chat("ยืนยัน")).status,lastText()).toBe(200);expect((await db.from("notification_preferences").select("daily,send_at").eq("user_id",owner.data!.id).single()).data,lastText()).toMatchObject({daily:true,send_at:"20:00:00"});
  });
  it("a proposed bill is created once even if the old confirmation button is tapped again",async()=>{
    await figma();await chat("เพิ่มบิล ค่าหอ 500 บาท");const confirm=lastButtons().find(b=>b.label==="ยืนยัน")?.data;expect(confirm).toBeTruthy();
    expect((await tap(confirm!)).status,lastText()).toBe(200);expect(lastText()).toContain("เพิ่มบิล");await tap(confirm!);
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();const plans=await db.from("plans").select("amount").eq("user_id",owner.data!.id).eq("title","ค่าหอ").eq("amount",50000);expect(plans.data).toEqual([{amount:50000}]);
  });
  it("points review and balance are usable without opening MINI App",async()=>{
    await figma();await chat("ดูแต้ม");expect(lastText()).toContain("0 แต้ม");await chat("เช็กครบแล้ว");expect(lastText()).toContain("1 แต้ม");await chat("ดูแต้ม");expect(lastText()).toContain("1 แต้ม");
  });
  it("cancellation closes an old confirmation button", async()=>{
    await figma();await chat("เพิ่มบิล ค่าไฟ 100 บาท");const button=lastButtons().find(b=>b.label==="ยืนยัน")!.data!;
    await chat("ยกเลิก");await tap(button);expect(lastText()).toContain("จบแล้ว");
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();
    expect((await db.from("plans").select("id").eq("user_id",owner.data!.id).eq("title","ค่าไฟ")).data).toEqual([]);
  });
  it("another account cannot confirm the owner's draft", async()=>{
    await figma();await chat("เพิ่มบิล ค่าไฟ 100 บาท");const button=lastButtons().find(b=>b.label==="ยืนยัน")!.data!;
    const other=`U_other_${run}`,id=`other_${run}_${eventIds.length}`;eventIds.push(id);
    try{expect((await deliver({type:"postback",webhookEventId:id,replyToken:"other",source:{type:"user",userId:other},postback:{data:button}})).status).toBe(200);expect(lastText()).toContain("ไม่ใช่ของบัญชีนี้");}
    finally{await db.from("users").delete().eq("line_user_id",other);}
  });
  it("a changed budget refuses an older mutation preview",async()=>{
    await figma();await chat("กันเงินเผื่อ 200 บาท");const button=lastButtons().find(b=>b.label==="ยืนยัน")!.data!;
    await chat("ข้าว 45");await tap(button);expect(lastText()).toContain("เปลี่ยน");
  });
  it("asks for a missing bill amount before previewing it",async()=>{
    await figma();await chat("เพิ่มบิล ค่าไฟ");expect(lastText()).toContain("กี่บาท");await chat("100");expect(lastText()).toContain("ยืนยัน");await chat("ยืนยัน");expect(lastText()).toContain("เพิ่มบิล ค่าไฟ 100 บาท");
  });
  it("adjusts actual balance and essentials with confirmations",async()=>{
    await figma();await chat("ปรับยอด 2000 บาท");await chat("ยืนยัน");expect(lastText()).toContain("2,000 บาท");expect(await screenEntries()).toEqual([]);
    await chat("ตั้งค่าอาหาร 50 ค่ารถ 20");await chat("ยืนยัน");expect(lastText()).toContain("อาหาร 50 บาท");
  });
  it("edits and deletes an owned entry through chat, without duplicate writes",async()=>{
    await figma();await chat("ข้าว 45");await chat("แก้รายการล่าสุด 60 บาท");await chat("ยืนยัน");expect((await screenEntries())[0].amount).toBe(6000);
    await chat("ลบรายการล่าสุด");await chat("ยืนยัน");expect(await screenEntries()).toEqual([]);
  });
  it("pays and undoes a bill using transactional plan actions",async()=>{
    await figma();await chat("จ่ายบิล 1");await chat("ยืนยัน");expect((await screenEntries())[0].amount).toBe(60000);
    await chat("ยกเลิกการจ่ายบิล 1");await chat("ยืนยัน");expect(await screenEntries()).toEqual([]);
  });
  it("sets up a new account entirely in chat without inventing income or essentials",async()=>{
    await chat("ได้รับเงิน 1000 บาท");expect(lastText()).toContain("ยังไม่ได้ตั้งรอบเงิน");
    for(const message of ["เริ่มรอบเงิน","เงินจากบ้าน","รายเดือน","1000",addDays(today(),12),"100","50","ข้าม"]){expect((await chat(message)).status).toBe(200);}
    expect(lastText()).toContain("ยืนยัน");await chat("ยืนยัน");expect(lastText()).toContain("เริ่มรอบเงินแล้ว");
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();
    expect((await db.from("incomes").select("id").eq("user_id",owner.data!.id)).data).toEqual([]);
    expect((await db.from("cycles").select("start_balance,essential_food_daily").eq("user_id",owner.data!.id).single()).data).toMatchObject({start_balance:100000,essential_food_daily:null});
  });
  it("redeems a catalog reward once from a confirmed chat card",async()=>{
    await figma();await chat("เช็กครบแล้ว");
    const reward=await db.from("rewards").insert({name:"Chat test reward",stock:1,cost:1,active:true}).select("id").single();expect(reward.error).toBeNull();
    try{
      await chat("แลกของ");const pick=lastButtons().find(b=>b.label === "เลือก 1")!.data!;await tap(pick);expect(lastText()).toContain("ใช้ 1 แต้ม");
      const confirm=lastButtons().find(b=>b.label === "ยืนยัน")!.data!;await tap(confirm);expect(lastText()).toContain("เหลือ 0 แต้ม");await tap(confirm);expect(lastText()).toContain("จบแล้ว");
      expect((await db.from("rewards").select("stock").eq("id",reward.data!.id).single()).data!.stock).toBe(0);
    }finally{expect((await db.from("reward_claims").delete().eq("reward_id",reward.data!.id)).error).toBeNull();expect((await db.from("rewards").delete().eq("id",reward.data!.id)).error).toBeNull();}
  });
  it("AI routes a natural read request without booking the model's invented write",async()=>{
    await figma();await chat("ข้าว 45");
    vi.mocked(generate).mockResolvedValueOnce(JSON.stringify({tool:"report",amount:100000,userId:"other",selected:{id:"other"}}));
    await chat("ขอข้อมูลรายงานของฉันหน่อย");expect(lastText()).toContain("รายงานเดือนนี้");expect((await screenEntries()).map((e: { amount: number }) => e.amount)).toEqual([4500]);
  });

  it("shows explicitly fictional coupons in chat without recording a spend",async()=>{
    await figma();await chat("ดูคูปอง");expect(lastText()).toContain("ใช้ซื้อจริงไม่ได้");expect(lastText()).toContain("โฆษณาตัวอย่าง");expect(lastText()).toContain("ผู้สนับสนุนสมมติ");expect(lastText()).not.toContain("DEMO-MEAL49");expect(await screenEntries()).toEqual([]);
  });

  it.each(["ค้นเว็บ ข้าว 50", "search coffee 50"])("search commands never become payments: %s", async (message) => {
    await figma();
    await chat(message);
    expect(await screenEntries()).toEqual([]);
    expect(lastText()).toContain("หน้าค้นหา");
    expect(lastButtons()).toContainEqual(expect.objectContaining({ type: "uri", label: "ค้นเว็บ" }));
  });

  it.each([
    "ไม่ซื้อกาแฟ 50 แล้ว", "ไม่ได้จ่ายข้าว 45", "โอนให้เพื่อน 100", "ข้าว 45 ไม่สิ 50",
    "ข้าว 200 หาร 4 คน", "เบอร์ 0812345678", "ปี 2026", "cancel coffee 50",
    "I didn't buy coffee 50", "พรุ่งนี้ซื้อข้าว 50", "refund 100", "แกล้งบอกว่าจดข้าว 45 แล้ว",
    "ไม่ใช่ 50", "อันเมื่อกี้ 45", "เหมือนเดิม 50",
  ])("adaptive chat never writes ambiguous or non-spending numbers: %s", async (message) => {
    await figma();
    expect((await chat(message)).status).toBe(200);
    expect(await screenEntries()).toEqual([]);
    expect(lastText()).not.toContain("จดแล้ว ✓");
  });

  it.each(["ขอบคุณ", "สวัสดีครับ", "ไม่ต้องจดแล้ว", "โอนให้เพื่อน", "ยกเลิก"])(
    "a topic change cannot become the title of a pending amount: %s", async (message) => {
      await figma();
      await chat("45");
      await chat(message);
      expect(await screenEntries()).toEqual([]);
      await chat("50");
      expect(await screenEntries()).toEqual([]); // old pending amount was cleared
    },
  );

  beforeEach(() => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    const commandOwner=await db.from("users").select("id").eq("line_user_id",lineA).maybeSingle();
    if(commandOwner.data)await db.from("line_events").delete().like("webhook_event_id",`chat-command:${commandOwner.data.id}:%`);
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
      ["ข้าว", "จ่ายไปกี่บาท", "กรอกเองในแอป"],
      ["Hey", "ยังตอบข้อความนี้ไม่ได้", "เปิดแอป"],
      ["ข้าว 50 น้ำ 20 รวม 70", "ยังแยกชื่อกับยอดได้ไม่ครบ", "กรอกเองในแอป"],
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

  it("routine replies need no AI; a known item asks for its amount and records only after the answer", async () => {
    await figma();
    vi.mocked(generate).mockClear();
    await chat("นายเป็นใคร");
    expect(lastText()).toContain("ผมชื่อพอใช้");
    await chat("กาแฟ");
    expect(lastText()).toContain("จ่ายไปกี่บาท");
    expect(await screenEntries()).toEqual([]);
    await chat("45");
    expect(await screenEntries()).toEqual([expect.objectContaining({ note: "กาแฟ", amount: 4500 })]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("a bare amount followed by a routine item name still completes the pending title", async () => {
    await figma();
    expect((await chat("45")).status).toBe(200);
    expect(await screenEntries()).toEqual([]);
    expect((await chat("ข้าว")).status).toBe(200);
    expect(await screenEntries()).toEqual([expect.objectContaining({ note: "ข้าว", amount: 4500 })]);
  });

  it("changing the topic clears an old pending amount; a later number does not record the old item", async () => {
    await figma();
    await chat("กาแฟ");
    await chat("นายเป็นใคร");
    expect(lastText()).toContain("ผมชื่อพอใช้");
    await chat("45");
    expect(lastText()).toContain("ค่าอะไร");
    expect(await screenEntries()).toEqual([]);
  });

  it("a what-if interrupts pending spending without turning a later number into payment", async () => {
    await figma();
    await chat("กาแฟ");
    await chat("ถ้าซื้อหูฟัง 700 ได้ไหม");
    expect(await screenEntries()).toEqual([]);
    await chat("45");
    expect(lastText()).toContain("ค่าอะไร");
    expect(await screenEntries()).toEqual([]);
  });

  it("a model daily-unit mixup falls back without changing existing expenses", async () => {
    await figma();
    await chat("ข้าว 45");
    vi.mocked(generate).mockResolvedValueOnce(JSON.stringify({ intent: "chat", topic: "money", item: null, reply: "วันนี้ใช้ได้อีก 75/วันครับ" }));
    await chat("ใช้เยอะไปไหมวันนี้");
    expect(lastText()).not.toContain("75/วัน");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 75 บาท");
    expect(await screenEntries()).toEqual([expect.objectContaining({ note: "ข้าว", amount: 4500 })]);
  });

  it("adding the OA as a friend: a welcome with a button to the app (MINI App link when the app is a MINI App)", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545254-6025ZG1r");
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "2012545254");
    eventIds.push(`F_${run}`);
    await deliver({ type: "follow", webhookEventId: `F_${run}`, replyToken: "rt-f", source: { type: "user", userId: lineA } });
    expect(last().type).toBe("flex"); // โฟรวิว's welcome card
    expect(lastText()).toContain("สวัสดีครับ ฉันคือพอใช้");
    const message=last();if(message.type!=="flex" || message.contents.type!=="carousel")throw new Error("Expected onboarding carousel");
    expect(message.contents.contents).toHaveLength(10);
    expect(lastButtons()).toContainEqual(expect.objectContaining({type:"postback",data:"guide:start"}));
    expect(lastButtons()).toContainEqual({type:"uri",label:"ตั้งค่าใน MINI App",uri:"https://miniapp.line.me/2012545254-6025ZG1r/setup/income"});
  });

  it("follow redelivery replies once; every onboarding topic stays read-only",async()=>{
    const eventId=`guide-follow-${run}-${eventIds.length}`;eventIds.push(eventId);
    const event={type:"follow",webhookEventId:eventId,replyToken:"guide-follow",source:{type:"user",userId:lineA}};
    expect((await deliver(event)).status).toBe(200);const count=replies.length;expect((await deliver(event)).status).toBe(200);expect(replies).toHaveLength(count);
    const guides=lastButtons().filter(b=>b.data?.startsWith("guide:") && b.data!=="guide:all");expect(guides).toHaveLength(10);
    for(const guide of guides){expect((await tap(guide.data!)).status).toBe(200);expect(lastText()).toContain("ยังไม่ได้บันทึกหรือเปลี่ยนข้อมูล");expect(last().type).toBe("flex");}
    const owner=await db.from("users").select("id").eq("line_user_id",lineA).single();expect(owner.error).toBeNull();
    for(const table of ["entries","incomes","cycles","points_ledger"]){const r=await db.from(table).select("user_id").eq("user_id",owner.data!.id);expect(r.error).toBeNull();expect(r.data).toEqual([]);}
    await chat("คู่มือ");const message=last();expect(message.type).toBe("flex");if(message.type!=="flex" || message.contents.type!=="carousel")throw Error("carousel required");expect(message.contents.contents).toHaveLength(10);
  });

  it("the app link stays a LIFF link when the app is the LIFF app", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545176-udYyTUiA");
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "2012545254");
    await chat("Hey");
    expect(lastButtons()).toEqual([expect.objectContaining({ uri: "https://liff.line.me/2012545176-udYyTUiA" }),expect.objectContaining({data:"guide:all",label:"วิธีใช้"})]);
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
    expect(lastButtons().map((b) => b.label)).toEqual(["ยืนยันจ่ายจริง", "ลองก่อนซื้อ", "เปิดแอป", "วิธีใช้"]);
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
    expect(last().type).toBe("flex");
    expect(last()).toMatchObject({ altText: "ชาบูราคาเท่าไรเอ่ย?" });
    expect(lastText()).toContain("ชาบูราคาเท่าไรเอ่ย?");
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
    expect(last().type).toBe("flex");
    expect(last()).toMatchObject({ altText: "สวัสดี! วันนี้ใช้ได้อีก 120 บาทนะ" });
    expect(lastText()).toContain("สวัสดี! วันนี้ใช้ได้อีก 120 บาทนะ");
    expect(await memory()).toEqual([
      { role: "user", body: "Hey" },
      { role: "bot", body: "สวัสดี! วันนี้ใช้ได้อีก 120 บาทนะ" },
    ]);
  });

  it("the AI is sent the chat and the numbers only — never the LINE id", async () => {
    await figma();
    await chat("ข้าว 45");
    await chat("ควรเก็บเงินยังไงดี");
    const input = vi.mocked(generate).mock.calls.at(-1)![0].input;
    expect(input).not.toContain(lineA);
    expect(JSON.parse(input)).toMatchObject({
      facts: { setUp: true, todayRemaining: 75, dailyBudget: 120 },
      history: [{ role: "user", text: "ข้าว 45" }, { role: "bot" }],
      message: "ควรเก็บเงินยังไงดี",
    });
  });

  it("AI off or a reply with a made-up number → the template says it cannot answer, plus what is left today (no greeting, no list of 3 things)", async () => {
    await figma();
    await chat("ช่วยดูให้หน่อย");
    expect(lastText()).toContain("ยังตอบข้อความนี้ไม่ได้");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
    expect(lastText()).toContain("เมนูพอใช้");
    expect(lastText()).not.toContain("สวัสดี");
    expect(lastText()).not.toContain("ผมชื่อพอใช้");
    expect(lastText()).not.toContain("3 อย่าง");
    aiSays({ intent: "chat", topic: "money", item: null, reply: "เหลือ 999 บาทจ้า" });
    await chat("ควรเก็บเงินยังไงดี");
    expect(lastText()).not.toContain("999");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
  });

  it("«เหลือกี่บาท?» is the budget card, not a try-before-you-buy question", async () => {
    await figma();
    await chat("เหลือกี่บาท?");
    expect(last().type).toBe("flex");
    expect(lastText()).not.toContain("อยากซื้ออะไร");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
  });

  it("«เหลือเท่าไร» / «เหลือเงินทั้งหมดเท่าไร»: the budget card from the calculator — the AI is never asked, nothing is saved", async () => {
    await figma();
    await chat("ข้าว 45");
    for (const ask of ["เหลือเท่าไร", "เหลือเงินทั้งหมดเท่าไร", "งบเหลือป่ะ", "วันนี้ใช้ไปเท่าไร"]) {
      await chat(ask);
      expect(last().type, ask).toBe("flex");
      expect(lastText(), ask).toContain("วันนี้ใช้ได้อีก 75 บาท");
      expect(lastText(), ask).toContain("ใช้ไปแล้ว 45 จาก 120 บาท");
      expect(lastText(), ask).toContain("เงินทั้งหมดตอนนี้ 2,355 บาท"); // 2,400 − 45
    }
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(await screenEntries()).toHaveLength(1);
  });

  it("an item without a price still goes to the AI: «ถ้ากินชาบูจะเหลือเท่าไร»", async () => {
    await figma();
    await chat("ถ้ากินชาบูจะเหลือเท่าไร");
    expect(vi.mocked(generate)).toHaveBeenCalledTimes(1);
  });

  // 15 Nov: important asks are cards with the calculator's numbers, never the AI's sentence
  it("«วันเงินเข้าเมื่อไร»: today's card answering when the money comes", async () => {
    await figma();
    vi.mocked(generate).mockClear();
    await chat("วันเงินเข้าเมื่อไร");
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("เงินเข้าวันที่");
    expect(lastText()).toContain("อีก 12 วัน");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 120 บาท");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
  });

  it("«เงินพอถึงวันเงินเข้าไหม»: today's card answering if it lasts, against payday", async () => {
    await figma();
    vi.mocked(generate).mockClear();
    for (const ask of ["เงินพอถึงวันเงินเข้าไหม", "พอถึงสิ้นเดือนไหม"]) {
      await chat(ask);
      expect(last().type, ask).toBe("flex");
      expect(lastText(), ask).toContain("พอครับ ถ้าใช้ไม่เกินวันละ 120 บาท ถึงวันเงินเข้า");
    }
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(await screenEntries()).toEqual([]);
  });

  it("«สัปดาห์นี้ / เมื่อวาน / เดือนนี้ใช้ไปเท่าไร»: the report card, Thai dates and a button to the report screen", async () => {
    await figma();
    await chat("ข้าว 45");
    vi.mocked(generate).mockClear();
    await chat("สัปดาห์นี้ใช้ไปเท่าไร");
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("รายงานสัปดาห์นี้");
    expect(lastText()).toContain("45 บาท");
    expect(lastText()).not.toMatch(/\d{4}-\d{2}-\d{2}|ไม่รวมวันสุดท้าย/);
    expect(lastButtons()).toContainEqual(expect.objectContaining({ type: "uri", label: "ดูรายงานในแอป", uri: expect.stringMatching(/\/reports$/) }));
    await chat("เมื่อวานใช้ไปเท่าไร");
    expect(lastText()).toContain("รายงานเมื่อวาน");
    expect(lastText()).toContain("ยังไม่มีรายการ");
    await chat("เดือนนี้ใช้ไปเท่าไร");
    expect(lastText()).toContain("รายงานเดือนนี้");
    expect(lastText()).toContain("45 บาท");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(await screenEntries()).toHaveLength(1);
  });

  it("«เหลือเท่าไร» before setting up: set up first", async () => {
    await chat("เหลือเท่าไร");
    expect(lastText()).toContain("ยังไม่ได้ตั้งรอบเงิน");
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

  it("several spends: explicit pairs propose without AI, [จดทั้งหมด] records each once", async () => {
    await figma();
    aiSays({ items: [{ title: "ข้าว", amount_baht: 45 }, { title: "น้ำ", amount_baht: 20 }] });
    await chat("ข้าว 45 น้ำ 20");
    expect(last().type).toBe("flex"); // proposal card
    expect(lastText()).toContain("เจอ 2 รายการ รวม 65 บาท");
    for (const t of ["ข้าว", "45 บาท", "น้ำ", "20 บาท", "อาหาร"]) expect(lastText()).toContain(t);
    expect(lastButtons().map((b) => b.label)).toEqual(["จดทั้งหมด", "ไม่ใช่", "กรอกเองในแอป", "เปิดแอป", "วิธีใช้"]);
    expect(await screenEntries()).toEqual([]);

    const owner = await db.from("users").select("id").eq("line_user_id", lineA).single();
    expect(owner.error).toBeNull();
    const pending = await db.from("chat_messages").select("pending").eq("user_id", owner.data!.id).not("pending", "is", null);
    expect(pending.error).toBeNull();
    expect(pending.data).toContainEqual({ pending: expect.objectContaining({ kind: "items", items: [
      expect.objectContaining({ title: "ข้าว", amount: 4500 }), expect.objectContaining({ title: "น้ำ", amount: 2000 }),
    ] }) });

    const all = button("จดทั้งหมด").data;
    await tap(all);
    expect(last().type).toBe("flex"); // โฟรวิว's recorded card with 2 items (Figma L10)
    expect(lastText()).toContain("จดแล้ว ✓ 2 รายการ");
    expect(lastText()).toContain("วันนี้ใช้ได้อีก 55 บาท");
    await tap(all);
    expect(lastText()).toContain("จดไว้แล้ว");
    expect((await screenEntries()).map((e: { amount: number }) => e.amount).sort()).toEqual([2000, 4500]);
  });

  it("P-14: an unpriced future wish asks for its amount, never becomes a payment or a priced plan", async () => {
    await figma();
    const owner = await db.from("users").select("id").eq("line_user_id", lineA).single();
    expect(owner.error).toBeNull();
    const before = await db.from("plans").select("id,amount,title").eq("user_id", owner.data!.id).order("id");
    expect(before.error).toBeNull();
    // Even an invented model price cannot supply a missing user amount.
    aiSays({ kind: "spend", title: "หมูกระทะ", amount_baht: 199, amount: 19900 });
    expect((await chat("อยากกินหมูกระทะวันศุกร์")).status).toBe(200);
    expect(lastText()).toMatch(/กี่บาท|ราคา|เท่าไร|จำนวนเงิน|ยอด/);
    expect(await screenEntries()).toEqual([]);
    const plans = await db.from("plans").select("id,amount,title").eq("user_id", owner.data!.id).order("id");
    expect(plans.error).toBeNull();
    expect(plans.data).toEqual(before.data); // preserve the fixture's existing bill
    const memory = await db.from("chat_messages").select("pending").eq("user_id", owner.data!.id).not("pending", "is", null);
    expect(memory.error).toBeNull();
    for (const row of memory.data ?? []) {
      expect(row.pending.kind).not.toBe("items");
      expect(row.pending.draft?.amount ?? null).toBeNull();
    }
  });

  it("a future purchase with a price still never records an immediate payment", async () => {
    await figma();
    aiSays({ intent: "spend", topic: "finance", item: "หูฟัง", reply: "" });
    expect((await chat("อยากซื้อหูฟัง 199")).status).toBe(200);
    expect(lastText()).not.toContain("จดแล้ว");
    expect(await screenEntries()).toEqual([]);
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
    await chat("45 บาทค่าข้าว 20 บาทค่าน้ำ");
    expect(lastText()).toContain("ยังแยกชื่อกับยอดได้ไม่ครบ");
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
    expect(lastButtons().map((b) => b.label)).toEqual(["แก้", "เปลี่ยนหมวด", "ลบ", "เปิดแผน", "วันนี้ใช้ได้", "เปิดแอป", "วิธีใช้"]);
    expect(data("ลบ")).toBe(`v1.entry_del.${entry.id}`);
  });

  it("L9 เปลี่ยนหมวด: four categories as quick replies; picking one changes it", async () => {
    await figma();
    await chat("ข้าว 45");
    await tap(data("เปลี่ยนหมวด"));
    expect(lastButtons().map((b) => b.label)).toEqual(["อาหาร", "เดินทาง", "ของใช้", "อื่น ๆ", "เปิดแอป", "วิธีใช้"]);
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

  // The menu made in LINE OA Manager (13 Nov) cannot send postbacks: its buttons send these texts
  it("OA Manager menu: «วิธีจดรายการ» and «ลองก่อนจ่าย» answer like the old buttons, without the AI", async () => {
    await figma();
    vi.mocked(generate).mockClear();
    await chat("วิธีจดรายการ");
    expect(lastText()).toContain("«ข้าว 45»");
    expect(lastButtons()).toContainEqual(expect.objectContaining({ type: "uri", label: "กรอกในแอป" }));
    await chat(" ลองก่อนจ่าย ");
    expect(lastText()).toContain("ไหวไหม");
    expect(lastButtons()).toContainEqual(expect.objectContaining({ type: "uri", label: "ลองในแอป" }));
    await chat("วันนี้ใช้ได้เท่าไหร่");
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("120 บาท");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(await screenEntries()).toEqual([]);
  });

  // 15 Nov: «ลบข้อมูลได้ไหม» got the greeting. Deleting is only done in the app (it cannot be undone)
  it("«ลบข้อมูลได้ไหม»: where to delete it in the app, with a button there; no AI and nothing deleted", async () => {
    await figma();
    await chat("ข้าว 45");
    vi.mocked(generate).mockClear();
    for (const ask of ["ลบข้อมูลได้ไหม", "อยากลบบัญชี"]) {
      await chat(ask);
      expect(lastText()).toContain("ตั้งค่า › ลบข้อมูลของฉัน");
      expect(lastText()).toContain("กู้คืนไม่ได้");
      expect(lastButtons()).toContainEqual(
        expect.objectContaining({ type: "uri", label: "ไปหน้าลบข้อมูล", uri: expect.stringMatching(/\/settings\/delete$/) }),
      );
    }
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(await screenEntries()).toHaveLength(1);
  });

  it("«ลบรายการล่าสุด» is still the chat command for one entry, not the account", async () => {
    await figma();
    await chat("ข้าว 45");
    await chat("ลบรายการล่าสุด");
    expect(lastText()).not.toContain("ลบข้อมูลของฉัน");
  });

  // 15 Nov: «วันนี้ใช้เงินได้เท่าไร» went to the AI (a sentence, not the card) or the "cannot answer" template
  it("«วันนี้ใช้เงินได้เท่าไร»: today's card with the calculator's numbers, not the AI", async () => {
    await figma();
    vi.mocked(generate).mockClear();
    await chat("วันนี้ใช้เงินได้เท่าไร");
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("120 บาท");
    expect(lastText()).toContain("เงินทั้งหมดตอนนี้");
    expect(lastText()).not.toContain("ยังตอบข้อความนี้ไม่ได้");
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
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

describe("price hints: «ถ้ากินตี๋น้อยจะเหลือเท่าไร» without a price — the team's usual price, to try only", () => {
  // letters only: a digit in the name would make «… 300 ไหวไหม» read as several prices
  const tag = run.replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
  const shop = `ร้านลอง${tag}`;
  beforeEach(async () => {
    replies.length = 0;
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
    vi.mocked(generate).mockReset().mockResolvedValue(null);
    const { error } = await db.from("price_hints").insert({
      name: shop,
      aliases: [`ลอง${tag}`],
      price: 27900,
      unit: "/คน",
      category: "food",
      source_url: "https://example.com/price",
      checked_on: "2026-10-01",
    });
    expect(error).toBeNull();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("price_hints").delete().eq("name", shop);
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().eq("line_user_id", lineA);
  });

  const data = (label: string) => (lastButtons().find((b) => b.label === label) as { data: string }).data;

  it("the usual price, when it was checked, and [ใช้ราคานี้ลอง] [พิมพ์ราคาเอง] — no AI, nothing saved", async () => {
    await figma();
    await chat(`ถ้ากิน${shop}จะเหลือเท่าไร`);
    expect(last().type).toBe("flex");
    expect(lastText()).toContain(`${shop} ราคาประมาณ 279 บาท/คน`);
    expect(lastText()).toContain("ต.ค. 69");
    expect(lastButtons().map((b) => b.label).slice(0, 2)).toEqual(["ใช้ราคานี้ลอง", "พิมพ์ราคาเอง"]);
    expect(vi.mocked(generate)).not.toHaveBeenCalled();
    expect(await screenEntries()).toEqual([]);
  });

  it("another name for the shop finds it too", async () => {
    await figma();
    await chat(`ลอง${tag}ไหวไหม`);
    expect(lastText()).toContain(`${shop} ราคาประมาณ 279 บาท/คน`);
  });

  it("[ใช้ราคานี้ลอง]: the try card at that price — (1,440 − 279) ÷ 12 = 96.75 a day; nothing saved", async () => {
    await figma();
    await chat(`ถ้ากิน${shop}จะเหลือเท่าไร`);
    await tap(data("ใช้ราคานี้ลอง"));
    expect(last().type).toBe("flex");
    expect(lastText()).toContain(shop);
    expect(lastText()).toContain("เหลือวันละ 96.75 บาท");
    expect(await screenEntries()).toEqual([]);
  });

  it("the real price typed straight after («250») or after [พิมพ์ราคาเอง] is tried instead", async () => {
    await figma();
    await chat(`ถ้ากิน${shop}จะเหลือเท่าไร`);
    await chat("250");
    expect(last().type).toBe("flex");
    expect(lastText()).toContain("เหลือวันละ 99 บาท");
    await chat(`ถ้ากิน${shop}จะเหลือเท่าไร`);
    await tap(data("พิมพ์ราคาเอง"));
    expect(lastText()).toContain("พิมพ์ราคาใหม่");
    await chat("250");
    expect(lastText()).toContain("เหลือวันละ 99 บาท");
    expect(await screenEntries()).toEqual([]);
  });

  it("not offered: a price in the message, not a question («กิน…» may be a spend), or a row the team switched off", async () => {
    await figma();
    await chat(`${shop} 300 ไหวไหม`);
    expect(lastText()).not.toContain("ราคาประมาณ");
    await chat(`กิน${shop}`);
    expect(lastText()).not.toContain("ราคาประมาณ");
    await db.from("price_hints").update({ active: false }).eq("name", shop);
    await chat(`ถ้ากิน${shop}จะเหลือเท่าไร`);
    expect(lastText()).not.toContain("ราคาประมาณ");
    expect(await screenEntries()).toEqual([]);
  });
});
