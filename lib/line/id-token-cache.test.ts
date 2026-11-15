import { describe, expect, it, vi } from "vitest";
import { createIdTokenVerifier } from "./id-token";

const response = (exp = 100) => Response.json({ sub: "verified-user", exp });
describe("verified token cache and single-flight", () => {
  it("1,000 requests using the same token share one LINE verification", async () => {
    const verifier = createIdTokenVerifier({ now: () => 1000 });
    const fetcher = vi.fn(async () => response());
    const outcomes = await Promise.all(Array.from({ length: 1000 }, () => verifier("token", "channel", fetcher)));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(outcomes.every((r) => r.ok)).toBe(true);
  });
  it("expires at verified exp or 30 seconds, and isolates different audiences", async () => {
    let time = 1000;
    const verifier = createIdTokenVerifier({ now: () => time });
    const fetcher = vi.fn(async () => response());
    await verifier("t", "a", fetcher); await verifier("t", "a", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await verifier("t", "b", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    time = 31001;
    await verifier("t", "a", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const short = vi.fn(async () => response(32));
    await verifier("short", "a", short); time = 32001;
    expect(await verifier("short", "a", short)).toEqual({ ok: false, reason: "invalid" });
  });
  it("does not cache unavailable/invalid results and never evicts by raw bearer token", async () => {
    const verifier = createIdTokenVerifier({ now: () => 1000, maxCache: 1 });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 })).mockImplementation(async () => response());
    expect(await verifier("a", "c", fetcher)).toEqual({ ok: false, reason: "unavailable" });
    await verifier("a", "c", fetcher); await verifier("b", "c", fetcher); await verifier("a", "c", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("bounds distinct in-flight tokens and frees slots on failure", async () => {
    const verifier = createIdTokenVerifier({ maxPending: 1 });
    let fail!: (error: Error) => void;
    const fetcher = vi.fn(() => new Promise<Response>((_resolve, reject) => { fail = reject; }));
    const first = verifier("a", "c", fetcher);
    expect(await verifier("b", "c", fetcher)).toEqual({ ok: false, reason: "unavailable" });
    fail(new Error("network"));
    await first;
    expect(await verifier("b", "c", async () => new Response(null, { status: 400 }))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("token cache isolation and recovery boundaries", () => {
  it.each([null, "100", true, {}])("rejects a malformed explicit expiry: %j", async (exp) => {
    const verifier = createIdTokenVerifier({ now: () => 1000 });
    const fetcher = vi.fn(async () => Response.json({ sub: "verified-user", exp }));
    expect(await verifier("t", "c", fetcher)).toEqual({ ok: false, reason: "invalid" });
  });
  it("a caller cannot mutate another request's cached identity", async () => {
    const verifier = createIdTokenVerifier({ now: () => 1000 });
    const fetcher = vi.fn(async () => response());
    const first = await verifier("t", "c", fetcher);
    if (first.ok) first.lineUserId = "someone-else";
    expect(await verifier("t", "c", fetcher)).toEqual({ ok: true, lineUserId: "verified-user" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("single-flight callers do not share mutable result objects", async () => {
    const verifier = createIdTokenVerifier({ now: () => 1000 });
    const fetcher = vi.fn(async () => response());
    const [first, second] = await Promise.all([verifier("t", "c", fetcher), verifier("t", "c", fetcher)]);
    if (first.ok) first.lineUserId = "changed";
    expect(second).toEqual({ ok: true, lineUserId: "verified-user" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("never serves an expired identity when LINE becomes unavailable", async () => {
    let time = 1000;
    const verifier = createIdTokenVerifier({ now: () => time });
    const fetcher = vi.fn().mockResolvedValueOnce(response(2)).mockResolvedValueOnce(new Response(null, { status: 503 })).mockImplementation(async () => response(100));
    expect((await verifier("t", "c", fetcher)).ok).toBe(true);
    time = 2000;
    expect(await verifier("t", "c", fetcher)).toEqual({ ok: false, reason: "unavailable" });
    expect((await verifier("t", "c", fetcher)).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("cache hits refresh LRU position; eviction does not remove the most recently used identity", async () => {
    const verifier = createIdTokenVerifier({ now: () => 1000, maxCache: 2 });
    const fetcher = vi.fn(async () => response());
    for (const token of ["a", "b", "a", "c", "a", "b"]) await verifier(token, "c", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("different audiences cannot share in-flight verification or identity results", async () => {
    const verifier = createIdTokenVerifier({ now: () => 1000 });
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => Response.json({ sub: String((init!.body as URLSearchParams).get("client_id")), exp: 100 }));
    const [a, b] = await Promise.all([verifier("same-token", "channel-a", fetcher), verifier("same-token", "channel-b", fetcher)]);
    expect(a).toEqual({ ok: true, lineUserId: "channel-a" });
    expect(b).toEqual({ ok: true, lineUserId: "channel-b" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["", "x".repeat(8193)])("invalid token length is rejected before network work", async (token) => {
    const fetcher = vi.fn();
    expect(await createIdTokenVerifier()(token, "c", fetcher)).toEqual({ ok: false, reason: "invalid" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
