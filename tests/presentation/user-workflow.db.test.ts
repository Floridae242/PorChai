import { createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { POST as webhook } from "@/app/api/line/webhook/route";
import { GET as getPoints } from "@/app/api/points/route";
import { GET as getPlans } from "@/app/api/plans/route";
import { GET as getNotifications } from "@/app/api/notifications/preferences/route";
import { GET as entries } from "@/app/api/entries/route";
import { getDb } from "@/lib/db/client";
import { addDays, thaiDate } from "@/lib/calc/time";
import type { ReplyMessage } from "@/lib/line/reply";

// Real signed webhook + real local DB. Only LINE delivery/identity and LLM are replaced.
const captured: ReplyMessage[][] = [];
vi.mock("@/lib/line/reply", async (original) => ({
  ...(await original<typeof import("@/lib/line/reply")>()),
  reply: vi.fn(async (_token: string, messages: ReplyMessage[]) => { captured.push(messages); }),
}));
vi.mock("@/lib/line/id-token", () => ({ verifyIdToken: vi.fn(async (token: string) => ({ ok: true, lineUserId: token })) }));
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null), groundedSearch: vi.fn(async () => null) }));
const lineId = `U_presentation_${randomUUID()}`;
const secret = randomUUID();
const eventIds: string[] = [];
const transcript: { title: string; input: string; messages: ReplyMessage[] }[] = [];
const db = getDb();
async function send(input: string, title: string, type = "message") {
  const id = `presentation-${randomUUID()}`;
  eventIds.push(id);
  const event = { type, webhookEventId: id, replyToken: id, source: { type: "user", userId: lineId }, ...(type === "message" ? { message: { type: "text", text: input } } : {}) };
  const body = JSON.stringify({ events: [event] });
  const before = captured.length;
  const response = await webhook(new Request("http://localhost/api/line/webhook", {
    method: "POST", body, headers: { "x-line-signature": createHmac("sha256", secret).update(body).digest("base64") },
  }));
  expect(response.status, title).toBe(200);
  expect(captured.length, `${title}: bot must reply`).toBeGreaterThan(before);
  const messages = captured.slice(before).flat();
  transcript.push({ title, input, messages });
  return JSON.stringify(messages);
}
async function saved() {
  const response = await entries(new Request("http://localhost/api/entries", { headers: { Authorization: `Bearer ${lineId}` } }));
  expect(response.status).toBe(200);
  return (await response.json()).entries as { amount: number; note: string }[];
}
afterEach(async () => {
  // Cleanup only our unique user/events. Never reset or delete another test's data.
  const owner = await db.from("users").select("id").eq("line_user_id", lineId).maybeSingle();
  if (owner.error) throw owner.error;
  if (owner.data) {
    const commands = await db.from("line_events").delete().like("webhook_event_id", `chat-command:${owner.data.id}:%`);
    if (commands.error) throw commands.error;
  }
  const events = await db.from("line_events").delete().in("webhook_event_id", eventIds);
  const user = await db.from("users").delete().eq("line_user_id", lineId);
  vi.unstubAllEnvs();
  if (events.error) throw events.error;
  if (user.error) throw user.error;
});
it("presentation: add OA → setup → record → edit → advice → bills → reports → points", async () => {
  vi.stubEnv("LINE_CHANNEL_SECRET", secret);
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "presentation-channel");
  vi.stubEnv("GEMINI_WEB_SEARCH_ENABLED", "0");
  expect(await send("เพิ่มเพื่อน OA", "01 · เพิ่มเพื่อนและดูคู่มือ", "follow")).toContain("carousel");
  await send("เริ่มรอบเงิน", "02 · เริ่มตั้งแผนในแชต");
  for (const input of ["ทางบ้าน", "รายเดือน", "3000", addDays(thaiDate(new Date()), 12), "300", "120", "50", "20"]) await send(input, "02 · ตอบข้อมูลแผนเงิน");
  expect(await send("ยืนยัน", "03 · ยืนยันแผนเงิน")).toContain("เริ่มรอบเงินแล้ว");
  expect(await send("ได้รับเงิน 1000 บาท", "04 · จดรายรับใน LINE")).toContain("1,000");
  await send("ข้าว 50", "05 · จดมื้อเที่ยง");
  expect(await saved()).toHaveLength(1);
  await send("แก้ยอดล่าสุด 40 บาท", "06 · ขอแก้ยอดเดิม");
  expect((await saved())[0].amount).toBe(5000);
  await send("ยืนยัน", "07 · ยืนยันแก้ยอดโดยไม่จดซ้ำ");
  expect(await saved()).toMatchObject([{ amount: 4000, note: "ข้าว" }]);
  await send("ข้าว -10", "08 · ป้องกันยอดผิด");
  expect(await saved()).toHaveLength(1);
  expect(await send("ข้าว 45 น้ำ 20 ค่ารถ 15", "09 · ตรวจร่างหลายรายการ")).toContain("จดทั้งหมด");
  expect(await saved()).toHaveLength(1);
  // Select the actual server-generated postback; never fabricate a draft key.
  function findPostback(value: unknown): string | undefined {
    if (!value || typeof value !== "object") return undefined;
    const node = value as Record<string, unknown>;
    if (node.type === "postback" && node.label === "จดทั้งหมด" && typeof node.data === "string") return node.data;
    for (const child of Object.values(node)) { const data = findPostback(child); if (data) return data; }
    return undefined;
  }
  const match = findPostback(captured.at(-1));
  expect(match).toBeTruthy();
  const id = `presentation-${randomUUID()}`; eventIds.push(id);
  const body = JSON.stringify({ events: [{ type: "postback", webhookEventId: id, replyToken: id, source: { type: "user", userId: lineId }, postback: { data: match } }] });
  const before = captured.length;
  expect((await webhook(new Request("http://localhost/api/line/webhook", { method: "POST", body, headers: { "x-line-signature": createHmac("sha256", secret).update(body).digest("base64") } }))).status).toBe(200);
  transcript.push({ title: "10 · ยืนยันจดทั้งหมด", input: "[กด จดทั้งหมด]", messages: captured.slice(before).flat() });
  expect(await saved()).toHaveLength(4);
  expect((await saved()).reduce((sum, e) => sum + e.amount, 0)).toBe(12000);
  const beforeTrial = await saved();
  await send("ชาบู 199 ไหวไหม", "11 · ถามก่อนจ่าย ยังไม่ซื้อ");
  expect(await saved()).toEqual(beforeTrial);
  for (const [input, title] of [
    ["เพิ่มบิล ค่าเน็ต 100 บาท พรุ่งนี้", "12 · เพิ่มบิล (ตรวจร่างก่อนยืนยัน)"],
    ["ยืนยัน", "13 · ยืนยันบิล"],
    ["ดูแผน", "14 · ดูบิลและแผน"],
    [`ผ่อน โทรศัพท์ ยอดรวม 12000 บาท 12 งวด เริ่ม ${addDays(thaiDate(new Date()), 3)} ไหวไหม`, "15 · ลองภาระผ่อน"],
    ["ดูรายงานวันนี้", "16 · สรุปรายวัน"],
    ["ดูรายงานเดือนนี้", "17 · สรุปรายเดือน"],
    ["วิเคราะห์", "18 · วิเคราะห์จากรายการที่จด"],
    ["ค้นรายจ่าย ข้าว", "19 · ค้นประวัติ"],
    ["ดูแต้ม", "20 · แต้มจากการจด"],
    ["เช็กครบแล้ว", "21 · รับแต้มซ้ำไม่ได้"],
    ["ดูคูปอง", "22 · โปรตัวอย่าง"],
    ["เปิดสรุปรายวัน เวลา 20:00", "23 · ตั้งการแจ้งเตือน"],
    ["ยืนยัน", "24 · ยืนยันการแจ้งเตือน"],
    ["ดูหมวด", "25 · หมวดและงบ"],
    ["วิธีใช้", "26 · เรียกคู่มืออีกครั้ง"],
  ]) {
    const output = await send(input, title);
    if (title.startsWith("15")) expect(output).toContain("ลองผ่อน ยังไม่ได้สร้างบิล");
    if (title.startsWith("16") || title.startsWith("17")) expect(output).toContain("120 บาท");
    if (title.startsWith("19")) expect(output).toContain("85 บาท");
    if (title.startsWith("20") || title.startsWith("21")) expect(output).toContain("1 แต้ม");
  }
  const request = (path: string) => new Request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${lineId}` } });
  const points = await getPoints(request("/api/points"));
  expect(points.status).toBe(200);
  expect(await points.json()).toMatchObject({ balance: 1, claimedToday: true });
  const plans = await getPlans(request("/api/plans"));
  expect(plans.status).toBe(200);
  expect((await plans.json()).plans).toMatchObject([{ title: "ค่าเน็ต", amount: 10000 }]);
  const notification = await getNotifications(request("/api/notifications/preferences"));
  expect(notification.status).toBe(200);
  expect(await notification.json()).toMatchObject({ daily: true, time: "20:00" });
  expect(await saved()).toHaveLength(4);
  if (process.env.PORCHAI_DEMO_EXPORT === "1") {
    await mkdir("artifacts/presentation", { recursive: true });
    await writeFile("artifacts/presentation/chat-transcript.json", JSON.stringify({
      schemaVersion: 1, generatedAt: new Date().toISOString(), mode: "local-webhook-db", lineAndAiMocked: true,
      transcript, assertions: { expenseCount: 4, spentSatang: 12000, negativeRejected: true, trialReadOnly: true },
    }, null, 2));
  }
}, 60_000);
