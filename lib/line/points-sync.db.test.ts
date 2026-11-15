import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { thaiDate, addDays } from "@/lib/calc/time";
import { POST as cycle } from "@/app/api/cycle/route";
import { POST as webhook } from "@/app/api/line/webhook/route";
import { GET as points } from "@/app/api/points/route";
import { POST as claim } from "@/app/api/points/claim/route";
import { GET as connection } from "@/app/api/points/connection/route";
import { reply, type ReplyMessage } from "@/lib/line/reply";
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (sub: string) => ({ ok: true, lineUserId: sub })),
}));
vi.mock("@/lib/ai/gemini", () => ({ generate: vi.fn(async () => null) }));
vi.mock("@/lib/line/reply", async (original) => ({
  ...(await original<typeof import("@/lib/line/reply")>()),
  reply: vi.fn(async () => {}),
}));
const db = getDb(),
  sub = `U_sync_${crypto.randomUUID()}`,
  events: string[] = [],
  fixtureSigningValue = "fake-signature-input";
const auth = {
  Authorization: `Bearer ${sub}`,
  "Content-Type": "application/json",
};
const read = () =>
  points(new Request("http://localhost/api/points", { headers: auth }));
async function chat(text: string) {
  const id = crypto.randomUUID();
  events.push(id);
  const body = JSON.stringify({
    events: [
      {
        type: "message",
        webhookEventId: id,
        replyToken: "test-reply",
        source: { type: "user", userId: sub },
        message: { type: "text", text },
      },
    ],
  });
  return webhook(
    new Request("http://localhost/api/line/webhook", {
      method: "POST",
      headers: {
        "x-line-signature": createHmac("sha256", fixtureSigningValue)
          .update(body)
          .digest("base64"),
      },
      body,
    }),
  );
}
function words(message: ReplyMessage) {
  return JSON.stringify(message);
}
beforeEach(() => {
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  vi.stubEnv("LINE_CHANNEL_SECRET", fixtureSigningValue);
  vi.clearAllMocks();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  expect(
    (await db.from("users").delete().eq("line_user_id", sub)).error,
  ).toBeNull();
  if (events.length)
    expect(
      (
        await db
          .from("line_events")
          .delete()
          .in("webhook_event_id", events.splice(0))
      ).error,
    ).toBeNull();
});
describe("one wallet for verified MINI App and signed OA events", () => {
  it("reads the same balance after a chat entry and repeated manual claim", async () => {
    const today = thaiDate(new Date());
    expect(
      (
        await cycle(
          new Request("http://localhost/api/cycle", {
            method: "POST",
            headers: auth,
            body: JSON.stringify({
              incomeSource: "family",
              incomeFrequency: "monthly",
              balance: 500000,
              payday: addDays(today, 14),
            }),
          }),
        )
      ).status,
    ).toBe(201);
    expect(await (await read()).json()).toEqual({
      balance: 0,
      claimedToday: false,
    });
    expect((await chat("ข้าว 50")).status).toBe(200);
    const response = await read();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ balance: 1, claimedToday: true });
    expect((await chat("ดูแต้ม")).status).toBe(200);
    expect(words(vi.mocked(reply).mock.calls.at(-1)![1][0])).toContain("1 แต้ม");
    const info = await (
      await connection(
        new Request("http://localhost/api/points/connection", {
          headers: auth,
        }),
      )
    ).json();
    expect(info.balance).toBe(1);
    expect(JSON.stringify(info)).not.toContain(sub);
    expect(info.accountCode).toMatch(/^[A-F0-9]{12}$/);
    await chat("ตรวจแต้ม");
    const diagnostic = words(vi.mocked(reply).mock.calls.at(-1)![1][0]);
    expect(diagnostic).toContain(info.accountCode);
    expect(diagnostic).toContain(info.systemCode);
    expect(diagnostic).not.toContain(sub);
    const manual = await claim(
      new Request("http://localhost/api/points/claim", {
        method: "POST",
        headers: { ...auth, "Idempotency-Key": "same-day-manual" },
      }),
    );
    expect(manual.status).toBe(200);
    expect(await manual.json()).toEqual({ balance: 1, claimedToday: true });
    expect((await chat("ดูแต้ม")).status).toBe(200);
    expect(words(vi.mocked(reply).mock.calls.at(-1)![1][0])).toContain("1 แต้ม");
  });
  it("answers multi-record capability questions truthfully without points or expense writes", async () => {
    expect((await chat("จดหลายรายการพร้อมกันได้หรือไม่")).status).toBe(200);
    const text = words(vi.mocked(reply).mock.calls.at(-1)![1][0]);
    expect(text).toContain("จดทั้งหมด");
    expect(text).toContain("จดหลายรายการพร้อมกันได้ครับ");
    expect(text).not.toContain("ตอนนี้ต้องส่งทีละรายการ");
    expect(await (await read()).json()).toEqual({
      balance: 0,
      claimedToday: false,
    });
    const user = await db
      .from("users")
      .select("id")
      .eq("line_user_id", sub)
      .single();
    expect(
      (await db.from("entries").select("id").eq("user_id", user.data!.id)).data,
    ).toEqual([]);
  });
});
