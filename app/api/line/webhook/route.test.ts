import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const secret = randomBytes(32).toString("hex");
function sign(body: string) {
  return createHmac("sha256", secret).update(body).digest("base64");
}
function request(body: string, signature: string | null = sign(body)) {
  return new Request("http://localhost/api/line/webhook", {
    method: "POST", body,
    headers: signature === null ? {} : { "x-line-signature": signature },
  });
}

beforeEach(() => vi.stubEnv("LINE_CHANNEL_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());

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
  it.each([null, "bad", "!".repeat(44)])("rejects missing or malformed signatures: %s", async signature => {
    expect((await POST(request('{"events":[]}', signature))).status).toBe(401);
  });
  it("checks signature before parsing JSON", async () => {
    expect((await POST(request('not json', "bad"))).status).toBe(401);
    expect((await POST(request('not json'))).status).toBe(400);
  });
  it.each(['{}', 'null', '{"events":{}}'])("rejects invalid payload: %s", async body => {
    expect((await POST(request(body))).status).toBe(400);
  });
  it("fails closed without a channel secret", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET", "");
    expect((await POST(request('{"events":[]}'))).status).toBe(503);
  });
});
