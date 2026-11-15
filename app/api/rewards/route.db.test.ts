import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as points } from "@/app/api/points/route";
import { POST as claim } from "@/app/api/points/claim/route";
import { GET as catalog } from "@/app/api/rewards/route";
import { POST as redeem } from "@/app/api/rewards/[id]/redeem/route";
import { getDb } from "@/lib/db/client";

vi.mock("@/lib/line/id-token", () => ({ verifyIdToken: vi.fn(async (token: string) =>
  token === "invalid" ? { ok: false, reason: "invalid" } : { ok: true, lineUserId: token }) }));
const db = getDb();
const line = `U_rewards_api_${crypto.randomUUID()}`;
let rewardId: string;
function req(path: string, method = "GET", key?: string, token = line, body?: object) {
  return new Request(`http://localhost/api/${path}`, { method, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key === undefined ? {} : { "Idempotency-Key": key }),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const ctx = () => ({ params: Promise.resolve({ id: rewardId }) });
beforeEach(async () => {
  vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "test-channel");
  const r = await db.from("rewards").insert({ name: "Test API reward", cost: 1, stock: 1 }).select("id").single();
  expect(r.error).toBeNull();
  rewardId = r.data!.id;
});
afterEach(async () => {
  expect((await db.from("users").delete().eq("line_user_id", line)).error).toBeNull();
  expect((await db.from("rewards").delete().eq("id", rewardId)).error).toBeNull();
  vi.unstubAllEnvs();
});
describe("authenticated points/rewards routes with real PostgreSQL", () => {
  it.each(["", "invalid"])("all four endpoints reject missing/invalid authentication (%s)", async (token) => {
    const responses = await Promise.all([points(req("points", "GET", undefined, token)), catalog(req("rewards", "GET", undefined, token)),
      claim(req("points/claim", "POST", "k", token)), redeem(req("rewards/id/redeem", "POST", "k", token), ctx())]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });
  it("wires zero balance, daily claim, catalog and stable redemption; ignores forged body ownership/date", async () => {
    expect(await (await points(req("points"))).json()).toEqual({ balance: 0, claimedToday: false });
    const earned = await claim(req("points/claim", "POST", "day", line, { userId: crypto.randomUUID(), date: "2000-01-01", amount: 999 }));
    expect(earned.status).toBe(201);
    expect(await earned.json()).toEqual({ balance: 1, claimedToday: true });
    expect((await claim(req("points/claim", "POST", "day"))).status).toBe(200);
    expect(await (await catalog(req("rewards"))).json()).toContainEqual({ id: rewardId, name: "Test API reward", stock: 1, cost: 1 });
    const first = await redeem(req("rewards/id/redeem", "POST", "redeem"), ctx());
    expect(first.status).toBe(201);
    const value = await first.json();
    expect(value).toEqual({ balance: 0, code: expect.stringMatching(/^RW-/) });
    const retry = await redeem(req("rewards/id/redeem", "POST", "redeem"), ctx());
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(value);
    expect((await redeem(req("rewards/id/redeem", "POST", "new"), ctx())).status).toBe(409);
  });
  it.each([undefined, " ", "x".repeat(101)])("both mutations reject invalid idempotency keys", async (key) => {
    expect((await claim(req("points/claim", "POST", key))).status).toBe(400);
    expect((await redeem(req("rewards/id/redeem", "POST", key), ctx())).status).toBe(400);
    expect(await (await points(req("points"))).json()).toEqual({ balance: 0, claimedToday: false });
  });
});
