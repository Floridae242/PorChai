import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { POST as webhook } from "@/app/api/line/webhook/route";

// Card 06 "LINE/LIFF ใช้บัญชีเดียวกันได้": a chat to the OA and the LIFF screens land on the same user row.
// Both channels sit under one LINE provider, so the webhook's source.userId equals the ID token's sub.

const secret = "test-secret";
const db = getDb();
const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const lineB = `U_B_${run}`;
const eventIds: string[] = [];

function chat(lineUserId: string | undefined, sourceType = "user") {
  const webhookEventId = `E_${run}_${eventIds.length}`;
  eventIds.push(webhookEventId);
  const body = JSON.stringify({
    events: [
      {
        type: "message",
        webhookEventId,
        source: lineUserId === undefined ? { type: sourceType } : { type: sourceType, userId: lineUserId },
        message: { type: "text", text: "ข้าว 45" },
      },
    ],
  });
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  return webhook(
    new Request("http://localhost/api/line/webhook", {
      method: "POST",
      headers: { "x-line-signature": signature },
      body,
    }),
  );
}

// LIFF: the ID token check returns this LINE user id
const liff = (lineUserId: string) =>
  requireUser(new Request("http://localhost/api/me", { headers: { Authorization: "Bearer t" } }), {
    verify: async (): Promise<VerifyResult> => ({ ok: true, lineUserId }),
  });

async function rows(lineUserId: string) {
  const { data } = await db.from("users").select("id").eq("line_user_id", lineUserId);
  return data!;
}

describe("card 06: one LINE account, chat and LIFF", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_CHANNEL_SECRET", secret);
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.from("line_events").delete().in("webhook_event_id", eventIds);
    await db.from("users").delete().in("line_user_id", [lineA, lineB]);
  });

  it("LIFF first, then a chat: the same user row", async () => {
    const { userId } = await liff(lineA);
    expect((await chat(lineA)).status).toBe(200);
    expect(await rows(lineA)).toEqual([{ id: userId }]);
  });

  it("a chat first, then LIFF: LIFF finds the user the chat made", async () => {
    await chat(lineA);
    const [made] = await rows(lineA);
    expect(made).toBeDefined();
    expect((await liff(lineA)).userId).toBe(made.id);
    expect(await rows(lineA)).toHaveLength(1);
  });

  it("two accounts stay two users", async () => {
    await chat(lineA);
    await chat(lineB);
    const [a] = await rows(lineA);
    const [b] = await rows(lineB);
    expect(a.id).not.toBe(b.id);
  });

  it("several chats at once from one account make one row", async () => {
    await Promise.all([chat(lineA), chat(lineA), chat(lineA)]);
    expect(await rows(lineA)).toHaveLength(1);
  });

  it("a group chat event or one without a userId creates nobody", async () => {
    expect((await chat(lineA, "group")).status).toBe(200);
    expect((await chat(undefined)).status).toBe(200);
    expect(await rows(lineA)).toHaveLength(0);
  });
});
