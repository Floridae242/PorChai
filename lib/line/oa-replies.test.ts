import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOaReply, createOaReplySender, sendOaReply } from "./oa-replies";

const id = "2012545254-6025ZG1r";
const follow = { type: "follow", replyToken: "fake-reply-token" };
afterEach(() => vi.unstubAllGlobals());

describe("Developing OA replies", () => {
  it("welcomes followers with the configured MINI App URI and truthful capability notice", () => {
    const reply = buildOaReply(follow, id)!;
    expect(reply.replyToken).toBe("fake-reply-token");
    expect(reply.messages[0].text).toContain("ยินดีต้อนรับ");
    expect(reply.messages[0].text).toContain("ยังไม่ถูกบันทึกเป็นรายจ่าย");
    expect(reply.messages[0].quickReply.items[0].action.uri).toBe(
      `https://miniapp.line.me/${id}`,
    );
  });
  it("replies to text without reflecting the user's private text", () => {
    const reply = buildOaReply(
      {
        ...follow,
        type: "message",
        message: { type: "text", text: "private-user-text" },
      },
      id,
    )!;
    expect(reply.messages[0].text).toContain("Developing");
    expect(JSON.stringify(reply)).not.toContain("private-user-text");
  });
  it.each([
    null,
    [],
    {},
    { type: "follow" },
    { ...follow, replyToken: "" },
    { ...follow, type: "unfollow" },
    { ...follow, mode: "standby" },
    { ...follow, type: "message", message: { type: "image" } },
    { ...follow, type: "message", message: { type: "text", text: 123 } },
  ])(
    "ignores unsupported or non-replyable event %j without requiring config",
    (event) => {
      expect(buildOaReply(event, undefined)).toBeNull();
    },
  );
  it.each([undefined, "", "bad/id", "https://evil.example", "123-a?x=1"])(
    "rejects invalid LIFF config %s",
    (value) => {
      expect(() => buildOaReply(follow, value)).toThrow("not configured");
    },
  );
  it("posts only to the fixed LINE reply API with a timeout and server token", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const reply = buildOaReply(follow, id)!;
    await sendOaReply(reply, "dummy-access-token");
    expect(mock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/reply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(reply),
        cache: "no-store",
        signal: expect.any(AbortSignal),
        headers: {
          Authorization: "Bearer dummy-access-token",
          "Content-Type": "application/json",
        },
      }),
    );
  });
  it("allows a redelivered event to build a reply", () => {
    expect(
      buildOaReply({ ...follow, deliveryContext: { isRedelivery: true } }, id),
    ).not.toBeNull();
  });
  it("deduplicates known successes and concurrent requests within a process", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const sender = createOaReplySender();
    const reply = buildOaReply(follow, id)!;
    await Promise.all([
      sender.send(reply, "dummy"),
      sender.send(reply, "dummy"),
    ]);
    await sender.send(reply, "dummy");
    expect(mock).toHaveBeenCalledOnce();
    expect(sender.hasSucceeded(reply.replyToken)).toBe(true);
  });
  it("does not cache failures and permits retry", async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const sender = createOaReplySender();
    const reply = buildOaReply(follow, id)!;
    await expect(sender.send(reply, "dummy")).rejects.toThrow("network");
    expect(sender.hasSucceeded(reply.replyToken)).toBe(false);
    await sender.send(reply, "dummy");
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("does not expose upstream errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("sensitive upstream response", { status: 401 }),
        ),
    );
    await expect(
      sendOaReply(buildOaReply(follow, id)!, "dummy"),
    ).rejects.toThrow("LINE reply failed");
  });
});
