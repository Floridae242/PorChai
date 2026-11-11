import { describe, expect, it, vi } from "vitest";
import { verifyIdToken } from "./id-token";

function res(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status });
}

describe("verifyIdToken", () => {
  it("returns the LINE user id on 200 and sends id_token + client_id", async () => {
    const fetchImpl = vi.fn(async () => res(200, { sub: "U123" }));
    const result = await verifyIdToken("tok", "chan", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, lineUserId: "U123" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("id_token")).toBe("tok");
    expect(body.get("client_id")).toBe("chan");
  });

  it("returns invalid on 4xx", async () => {
    const f = (async () => res(400, { error: "invalid_request" })) as unknown as typeof fetch;
    expect(await verifyIdToken("t", "c", f)).toEqual({ ok: false, reason: "invalid" });
  });

  it("returns unavailable on 5xx", async () => {
    const f = (async () => res(500)) as unknown as typeof fetch;
    expect(await verifyIdToken("t", "c", f)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns unavailable when fetch throws", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await verifyIdToken("t", "c", f)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns invalid when a 200 has no sub", async () => {
    const f = (async () => res(200, {})) as unknown as typeof fetch;
    expect(await verifyIdToken("t", "c", f)).toEqual({ ok: false, reason: "invalid" });
  });
});
