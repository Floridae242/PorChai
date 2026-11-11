import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import type { VerifyResult } from "@/lib/line/id-token";
import { GET } from "./route";

// Fake verifier: the token string is the LINE user id (or "bad" = rejected)
vi.mock("@/lib/line/id-token", () => ({
  verifyIdToken: vi.fn(async (token: string): Promise<VerifyResult> =>
    token === "bad" ? { ok: false, reason: "invalid" } : { ok: true, lineUserId: token },
  ),
}));

const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const lineB = `U_B_${run}`;

const call = (token?: string) =>
  GET(
    new Request("http://localhost/api/me", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );

describe("GET /api/me", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "test-channel");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    // Cascade removes cycles
    await getDb().from("users").delete().in("line_user_id", [lineA, lineB]);
  });

  it("401 unauthorized when there is no token", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("401 unauthorized when the verifier rejects the token", async () => {
    const res = await call("bad");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("hasActiveCycle is false for a user without a cycle", async () => {
    const res = await call(lineA);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasActiveCycle).toBe(false);
    expect(typeof body.userId).toBe("string");
  });

  it("hasActiveCycle is true only for the user who owns an active cycle", async () => {
    const { userId } = await (await call(lineA)).json();
    const { error } = await getDb()
      .from("cycles")
      .insert({ user_id: userId, start_balance: 1000, payday: "2026-12-01" });
    expect(error).toBeNull();

    const a = await (await call(lineA)).json();
    expect(a).toEqual({ userId, hasActiveCycle: true });

    const b = await (await call(lineB)).json();
    expect(b.hasActiveCycle).toBe(false);
    expect(b.userId).not.toBe(userId);
  });

  it("a closed cycle does not count as active", async () => {
    const { userId } = await (await call(lineA)).json();
    await getDb()
      .from("cycles")
      .insert({ user_id: userId, start_balance: 1000, payday: "2026-12-01", status: "closed" });
    expect((await (await call(lineA)).json()).hasActiveCycle).toBe(false);
  });
});
