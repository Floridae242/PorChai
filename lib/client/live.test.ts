import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { createLiveApi } from "./live";

type Call = { url: string; init: RequestInit };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setup(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const getIdToken = vi.fn(async () => "tok-1");
  const refreshIdToken = vi.fn(async () => "tok-2");
  const api = createLiveApi({ getIdToken, refreshIdToken, fetch: fetchFn, baseUrl: "https://x.test" });
  return { api, calls, fetchFn, getIdToken, refreshIdToken };
}

const hdr = (c: Call, k: string) => new Headers(c.init.headers).get(k);

describe("createLiveApi", () => {
  it("(a) sends Bearer token on every request", async () => {
    const { api, calls } = setup([json(200, { userId: "u", hasActiveCycle: true }), json(200, { entries: [] })]);
    expect(await api.me()).toEqual({ hasActiveCycle: true });
    await api.entries();
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(hdr(c, "Authorization")).toBe("Bearer tok-1");
    expect(calls[0].url).toBe("https://x.test/api/me");
    expect(calls[0].init.method).toBe("GET");
  });

  it("(b) addEntry sends Idempotency-Key and JSON body", async () => {
    const { api, calls } = setup([json(201, { entry: {}, summary: {} })]);
    await api.addEntry({ amount: 4500, category: "food" }, "key-123");
    expect(calls[0].url).toBe("https://x.test/api/entries");
    expect(calls[0].init.method).toBe("POST");
    expect(hdr(calls[0], "Idempotency-Key")).toBe("key-123");
    expect(hdr(calls[0], "Content-Type")).toBe("application/json");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ amount: 4500, category: "food" });
  });

  it("(c) 401 refreshes once and retries with same key/body", async () => {
    const { api, calls, refreshIdToken } = setup([
      json(401, { error: { code: "unauthorized", message: "x" } }),
      json(201, { entry: {}, summary: {} }),
    ]);
    await api.addEntry({ amount: 1, category: "food" }, "k");
    expect(refreshIdToken).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(hdr(calls[1], "Authorization")).toBe("Bearer tok-2");
    expect(hdr(calls[1], "Idempotency-Key")).toBe("k");
    expect(calls[1].init.body).toBe(calls[0].init.body);
  });

  it("(c) second 401 throws unauthorized, refresh called once", async () => {
    const { api, refreshIdToken, fetchFn } = setup([
      json(401, { error: { code: "unauthorized", message: "หมดอายุ" } }),
      json(401, { error: { code: "unauthorized", message: "หมดอายุ" } }),
    ]);
    await expect(api.summary()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(refreshIdToken).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("(d) maps server error body to ApiError", async () => {
    const { api } = setup([json(409, { error: { code: "no_cycle", message: "ยังไม่ได้ตั้งรอบ" } })]);
    const err = await api.summary().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "no_cycle", message: "ยังไม่ได้ตั้งรอบ" });
  });

  it("maps network failure, non-JSON and unknown error shapes", async () => {
    const a = setup([new TypeError("fail")]);
    await expect(a.api.me()).rejects.toMatchObject({ status: 0, code: "network", message: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง" });
    const b = setup([new Response("<html>", { status: 502 })]);
    await expect(b.api.me()).rejects.toMatchObject({ status: 0, code: "network" });
    const c = setup([json(500, { oops: 1 })]);
    await expect(c.api.me()).rejects.toMatchObject({ status: 500, code: "internal", message: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" });
  });

  it("(e) unimplemented endpoints throw 501 without fetch", async () => {
    const { api, fetchFn } = setup([]);
    const calls: Array<() => Promise<unknown>> = [
      () => api.consent(),
      () => api.acceptConsent("v1"),
      () => api.points(),
      () => api.claimPoints("k"),
      () => api.promos(),
      () => api.promo("p"),
      () => api.claimPromo("p"),
      () => api.rewards(),
      () => api.redeemReward("r", "k"),
      () => api.shopRedeem("c"),
    ];
    for (const fn of calls) {
      await expect(fn()).rejects.toMatchObject({ status: 501, code: "not_implemented", message: "ฟีเจอร์นี้ยังไม่พร้อมใช้งาน" });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("(f) URLs never contain user id or token; endpoints map correctly", async () => {
    const ok = () => json(200, { userId: "U-secret", hasActiveCycle: true, plan: {}, summary: {}, entry: {}, entries: [], plans: [] });
    const { api, calls } = setup(Array.from({ length: 13 }, ok));
    await api.me();
    await api.createCycle({ incomeSource: "family", incomeFrequency: "monthly", payday: "2030-01-01", balance: 1 });
    await api.summary();
    await api.editEntry("e 1", { amount: 5 });
    await api.cancelEntry("e1");
    await api.adjustBalance({ balance: 5 });
    await api.simulate({ amount: 5 });
    await api.setEssentials({ food: 1, transport: 1 });
    await api.plans();
    await api.addPlan({ title: "t", amount: 1 }, "k");
    await api.planAction("p1", "pay", { category: "food" });
    await api.planAction("p1", "keep");
    await api.entries();
    const got = calls.map((c) => `${c.init.method} ${c.url.replace("https://x.test", "")}`);
    expect(got).toEqual([
      "GET /api/me",
      "POST /api/cycle",
      "GET /api/summary",
      "PATCH /api/entries/e%201",
      "DELETE /api/entries/e1",
      "POST /api/cycle/balance",
      "POST /api/simulate",
      "PUT /api/cycle/essentials",
      "GET /api/plans",
      "POST /api/plans",
      "POST /api/plans/p1/pay",
      "POST /api/plans/p1/keep",
      "GET /api/entries",
    ]);
    for (const c of calls) {
      expect(c.url).not.toMatch(/tok-|U-secret|\?/);
    }
    expect(JSON.parse(String(calls[10].init.body))).toEqual({ category: "food" });
    expect(calls[11].init.body).toBeUndefined();
  });
});
