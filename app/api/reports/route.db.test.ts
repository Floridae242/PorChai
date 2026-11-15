import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as report } from "./route";
import { POST as search } from "@/app/api/search/route";
import {
  GET as preferences,
  PUT as savePreferences,
} from "@/app/api/notifications/preferences/route";
import { POST as cron } from "@/app/api/cron/digests/route";
import { groundedSearch } from "@/lib/ai/gemini";
import { getDb } from "@/lib/db/client";
import { createClient } from "@supabase/supabase-js";
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string) =>
    token === "invalid"
      ? { ok: false, reason: "invalid" }
      : { ok: true, lineUserId: token },
  ),
}));
vi.mock("@/lib/ai/gemini", () => ({ groundedSearch: vi.fn(async () => null) }));
const db = getDb(),
  line = `feature-api-${crypto.randomUUID()}`;
function request(path: string, method = "GET", body?: object, token = line) {
  return new Request(`http://localhost/api/${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "test-channel");
  vi.stubEnv("CRON_SECRET", "test-cron");
  vi.mocked(groundedSearch).mockReset().mockResolvedValue(null);
});
afterEach(async () => {
  const u = await db
    .from("users")
    .select("id")
    .eq("line_user_id", line)
    .maybeSingle();
  if (u.data)
    await db.from("ai_rate_windows").delete().eq("scope", `user:${u.data.id}`);
  expect(
    (await db.from("users").delete().eq("line_user_id", line)).error,
  ).toBeNull();
  vi.unstubAllEnvs();
});
describe("reports, notify and search auth boundaries", () => {
  it.each(["", "invalid"])(
    "all personal endpoints reject missing/invalid identity (%s)",
    async (token) => {
      const responses = await Promise.all([
        report(request("reports", "GET", undefined, token)),
        search(
          request("search", "POST", { mode: "entries", query: "ข้าว" }, token),
        ),
        preferences(
          request("notifications/preferences", "GET", undefined, token),
        ),
        savePreferences(
          request(
            "notifications/preferences",
            "PUT",
            { daily: true, monthly: true, budget: true, time: "20:00" },
            token,
          ),
        ),
      ]);
      expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    },
  );
  it("returns zero data without inventing a cycle and saves only the verified user's preferences", async () => {
    const r = await report(request("reports?period=day&date=2026-11-01"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      spending: 0,
      income: 0,
      entriesCount: 0,
    });
    expect(
      await (await preferences(request("notifications/preferences"))).json(),
    ).toEqual({ daily: false, monthly: false, budget: false, time: "20:00" });
    const saved = await savePreferences(
      request("notifications/preferences", "PUT", {
        daily: true,
        monthly: false,
        budget: true,
        time: "19:30",
        userId: crypto.randomUUID(),
      }),
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      daily: true,
      monthly: false,
      budget: true,
      time: "19:30",
    });
    const found = await search(
      request("search", "POST", {
        mode: "entries",
        query: "ข้าว",
        userId: crypto.randomUUID(),
      }),
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({
      count: 0,
      total: 0,
      entries: [],
    });
    expect(groundedSearch).not.toHaveBeenCalled();
  });
  it("fails closed when web search is disabled or lacks grounded evidence", async () => {
    vi.stubEnv("GEMINI_WEB_SEARCH_ENABLED", "0");
    expect(
      (
        await search(
          request("search", "POST", { mode: "web", query: "ราคาสมุด" }),
        )
      ).status,
    ).toBe(503);
    expect(groundedSearch).not.toHaveBeenCalled();
    vi.stubEnv("GEMINI_WEB_SEARCH_ENABLED", "1");
    expect(
      (
        await search(
          request("search", "POST", {
            mode: "web",
            query: "ราคาสมุด",
            history: "private",
            balance: 999,
          }),
        )
      ).status,
    ).toBe(503);
    expect(groundedSearch).toHaveBeenCalledWith("ราคาสมุด");
  });
  it.each([
    { mode: "bad", query: "x" },
    { mode: "entries", query: "" },
    { mode: "entries", query: "x".repeat(241) },
    { mode: "entries", query: "x", period: "all" },
  ])("rejects invalid search %#", async (body) =>
    expect((await search(request("search", "POST", body))).status).toBe(422),
  );
  it("keeps cron inaccessible to a normal LINE session", async () =>
    expect((await cron(request("cron/digests", "POST"))).status).toBe(401));
  it("denies anonymous SQL access to report/search functions and notification data", async () => {
    const anon = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    );
    expect(
      (
        await anon.rpc("finance_report", {
          p_user: crypto.randomUUID(),
          p_from: "2026-11-01",
          p_until: "2026-12-01",
          p_asof: "2026-11-15",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await anon.rpc("entry_search", {
          p_user: crypto.randomUUID(),
          p_query: "ข้าว",
          p_from: "2026-11-01",
          p_until: "2026-12-01",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await anon.from("notification_preferences").select("*")).error,
    ).not.toBeNull();
  });
});
