import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let POST: typeof import("./route").POST;

const secret = randomBytes(32).toString("hex");
function sign(body: string) {
  return createHmac("sha256", secret).update(body).digest("base64");
}
function request(body: string, signature: string | null = sign(body)) {
  return new Request("http://localhost/api/line/webhook", {
    method: "POST",
    body,
    headers: signature === null ? {} : { "x-line-signature": signature },
  });
}

const fetchMock = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  ({ POST } = await import("./route"));
  vi.stubEnv("LINE_CHANNEL_SECRET", secret);
  vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
  vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545254-6025ZG1r");
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LINE webhook", () => {
  it("accepts correctly signed events with original whitespace and Thai text", async () => {
    const body =
      '{ "events": [{"type":"message","message":{"text":"ข้าว 50"}}] }\n';
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, received: 1 });
  });
  it("accepts the Console verification payload with empty events", async () => {
    const response = await POST(request('{"destination":"Utest","events":[]}'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, received: 0 });
  });
  it("rejects a signature made with the wrong secret", async () => {
    const body = '{"events":[]}';
    const wrong = createHmac("sha256", "wrong-secret")
      .update(body)
      .digest("base64");
    expect((await POST(request(body, wrong))).status).toBe(401);
  });
  it("rejects a modified raw body even when the JSON is equivalent", async () => {
    expect(
      (await POST(request('{ "events": [] }', sign('{"events":[]}')))).status,
    ).toBe(401);
  });
  it.each([null, "bad", "!".repeat(44)])(
    "rejects missing or malformed signatures: %s",
    async (signature) => {
      expect((await POST(request('{"events":[]}', signature))).status).toBe(
        401,
      );
    },
  );
  it("checks signature before parsing JSON", async () => {
    expect((await POST(request("not json", "bad"))).status).toBe(401);
    expect((await POST(request("not json"))).status).toBe(400);
  });
  it.each(["{}", "null", '{"events":{}}'])(
    "rejects invalid payload: %s",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400);
    },
  );
  it("fails closed without a channel secret", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
    expect((await POST(request('{"events":[]}'))).status).toBe(503);
  });
  it("never sends a reply before verifying the raw signature", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-access-token");
    const body = JSON.stringify({
      events: [{ type: "follow", replyToken: "fake-token" }],
    });
    expect((await POST(request(body, "bad"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("replies to follow events using the server access token", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-access-token");
    const body = JSON.stringify({
      events: [{ type: "follow", replyToken: "fake-token" }],
    });
    expect((await POST(request(body))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer dummy-access-token",
    );
  });
  it("requires a token only for replyable events", async () => {
    const body = JSON.stringify({
      events: [{ type: "follow", replyToken: "fake-token" }],
    });
    expect((await POST(request(body))).status).toBe(503);
    expect((await POST(request('{"events":[]}'))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("acknowledges unsupported events without sending", async () => {
    const body = JSON.stringify({
      events: [null, { type: "unfollow" }],
    });
    expect((await POST(request(body))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns configuration error before sending when the MINI App ID is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "");
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-access-token");
    expect(
      (
        await POST(
          request(
            JSON.stringify({
              events: [{ type: "follow", replyToken: "fake-token" }],
            }),
          ),
        )
      ).status,
    ).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("retries a failed reply on redelivery instead of acknowledging it as complete", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-access-token");
    const event = { type: "follow", replyToken: "retry-network-token" };
    fetchMock.mockRejectedValueOnce(new Error("network failure"));
    expect(
      (await POST(request(JSON.stringify({ events: [event] })))).status,
    ).toBe(502);
    expect(
      (
        await POST(
          request(
            JSON.stringify({
              events: [{ ...event, deliveryContext: { isRedelivery: true } }],
            }),
          ),
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("retries after reply configuration is restored", async () => {
    const event = { type: "follow", replyToken: "retry-config-token" };
    expect(
      (await POST(request(JSON.stringify({ events: [event] })))).status,
    ).toBe(503);
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-access-token");
    expect(
      (
        await POST(
          request(
            JSON.stringify({
              events: [{ ...event, deliveryContext: { isRedelivery: true } }],
            }),
          ),
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("acknowledges a known successful duplicate without resending", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-access-token");
    const event = { type: "follow", replyToken: "known-success-token" };
    expect(
      (await POST(request(JSON.stringify({ events: [event] })))).status,
    ).toBe(200);
    expect(
      (
        await POST(
          request(
            JSON.stringify({
              events: [{ ...event, deliveryContext: { isRedelivery: true } }],
            }),
          ),
        )
      ).status,
    ).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["http", "network"])(
    "returns a safe 502 for %s reply failures",
    async (failure) => {
      vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "dummy-access-token");
      if (failure === "http")
        fetchMock.mockResolvedValue(
          new Response("private upstream data", { status: 401 }),
        );
      else fetchMock.mockRejectedValue(new Error("private token data"));
      const response = await POST(
        request(
          JSON.stringify({
            events: [{ type: "follow", replyToken: "fake-token" }],
          }),
        ),
      );
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "Could not send LINE reply",
      });
    },
  );
});
