import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db/line-events", () => ({ recordEvent: vi.fn(), forgetEvent: vi.fn() }));
vi.mock("@/lib/line/handle-event", () => ({ handleEvent: vi.fn() }));
import { forgetEvent, recordEvent } from "@/lib/db/line-events";
import { handleEvent } from "@/lib/line/handle-event";
let POST: typeof import("./route").POST;

// Webhook transport (from the MINI App branch): raw-byte signature, fail closed, strict payload.
// What happens to each event (replies, card 09/15) is tested in lib/line/chat.db.test.ts.

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

beforeEach(async () => {
  vi.resetModules();
  ({ POST } = await import("./route"));
  vi.stubEnv("LINE_CHANNEL_SECRET", secret);
  vi.mocked(recordEvent).mockReset().mockResolvedValue(true);
  vi.mocked(forgetEvent).mockReset().mockResolvedValue(undefined);
  vi.mocked(handleEvent).mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LINE webhook", () => {
  it("accepts correctly signed events with original whitespace and Thai text", async () => {
    const body = '{ "events": [{"type":"message","message":{"text":"ข้าว 50"}}] }\n';
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
    const wrong = createHmac("sha256", "wrong-secret").update(body).digest("base64");
    expect((await POST(request(body, wrong))).status).toBe(401);
  });
  it("rejects a modified raw body even when the JSON is equivalent", async () => {
    expect((await POST(request('{ "events": [] }', sign('{"events":[]}')))).status).toBe(401);
  });
  it.each([null, "bad", "!".repeat(44)])("rejects missing or malformed signatures: %s", async (signature) => {
    expect((await POST(request('{"events":[]}', signature))).status).toBe(401);
  });
  it("checks signature before parsing JSON", async () => {
    expect((await POST(request("not json", "bad"))).status).toBe(401);
    expect((await POST(request("not json"))).status).toBe(400);
  });
  it.each(["{}", "null", '{"events":{}}'])("rejects invalid payload: %s", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });
  it("fails closed without a channel secret", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
    expect((await POST(request('{"events":[]}'))).status).toBe(503);
  });
  it("never handles an event before verifying the raw signature", async () => {
    const body = JSON.stringify({ events: [{ type: "follow", webhookEventId: "e1", replyToken: "t" }] });
    expect((await POST(request(body, "bad"))).status).toBe(401);
    expect(recordEvent).not.toHaveBeenCalled();
    expect(handleEvent).not.toHaveBeenCalled();
  });
  it("handles each new event once; a redelivered one is skipped", async () => {
    vi.mocked(recordEvent).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const body = JSON.stringify({ events: [{ webhookEventId: "e1" }, { webhookEventId: "e1" }] });
    expect((await POST(request(body))).status).toBe(200);
    expect(handleEvent).toHaveBeenCalledOnce();
  });
  it("a failed event is forgotten and answered 500 so LINE redelivers it; the rest still run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(handleEvent).mockRejectedValueOnce(new Error("db down"));
    const body = JSON.stringify({ events: [{ webhookEventId: "bad" }, { webhookEventId: "good" }] });
    expect((await POST(request(body))).status).toBe(500);
    expect(forgetEvent).toHaveBeenCalledWith("bad");
    expect(handleEvent).toHaveBeenCalledTimes(2);
    vi.mocked(console.error).mockRestore();
  });
});
