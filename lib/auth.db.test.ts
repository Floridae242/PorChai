import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http";
import type { VerifyResult } from "@/lib/line/id-token";
import { requireUser } from "./auth";

const run = Math.random().toString(36).slice(2, 10);
const lineA = `U_A_${run}`;
const lineB = `U_B_${run}`;

function req(authorization?: string) {
  return new Request("http://localhost/api/x", {
    headers: authorization ? { Authorization: authorization } : {},
  });
}
const verifyAs = (r: VerifyResult) => ({ verify: async () => r });

async function status(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof HttpError) return e.status;
    throw e;
  }
  throw new Error("expected HttpError");
}

describe("requireUser", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-channel");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await getDb().from("users").delete().in("line_user_id", [lineA, lineB]);
  });

  it("401 when the Authorization header is missing", async () => {
    expect(await status(requireUser(req(), verifyAs({ ok: true, lineUserId: lineA })))).toBe(401);
  });

  it("401 for a non-Bearer scheme", async () => {
    expect(
      await status(requireUser(req("Basic abc"), verifyAs({ ok: true, lineUserId: lineA }))),
    ).toBe(401);
  });

  it("401 when the token is invalid", async () => {
    expect(
      await status(requireUser(req("Bearer t"), verifyAs({ ok: false, reason: "invalid" }))),
    ).toBe(401);
  });

  it("503 when LINE is unavailable", async () => {
    expect(
      await status(requireUser(req("Bearer t"), verifyAs({ ok: false, reason: "unavailable" }))),
    ).toBe(503);
  });

  it("passes the bearer token and channel id to the verifier", async () => {
    const verify = vi.fn(async (): Promise<VerifyResult> => ({ ok: true, lineUserId: lineA }));
    await requireUser(req("Bearer my-token"), { verify });
    expect(verify).toHaveBeenCalledWith("my-token", "test-channel");
  });

  it("returns the same userId for the same LINE user, with one users row", async () => {
    const deps = verifyAs({ ok: true, lineUserId: lineA });
    const first = await requireUser(req("Bearer t"), deps);
    const second = await requireUser(req("Bearer t"), deps);
    expect(second.userId).toBe(first.userId);
    expect(first.lineUserId).toBe(lineA);
    const { data } = await getDb().from("users").select("id").eq("line_user_id", lineA);
    expect(data).toHaveLength(1);
  });

  it("returns different userIds for different LINE users", async () => {
    const a = await requireUser(req("Bearer t"), verifyAs({ ok: true, lineUserId: lineA }));
    const b = await requireUser(req("Bearer t"), verifyAs({ ok: true, lineUserId: lineB }));
    expect(a.userId).not.toBe(b.userId);
  });

  it("concurrent first requests end with one row and the same userId", async () => {
    const deps = verifyAs({ ok: true, lineUserId: lineA });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => requireUser(req("Bearer t"), deps)),
    );
    expect(new Set(results.map((r) => r.userId)).size).toBe(1);
    const { data } = await getDb().from("users").select("id").eq("line_user_id", lineA);
    expect(data).toHaveLength(1);
  });

  it("throws a plain Error (not HttpError) when the channel id is not configured", async () => {
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "");
    const err = await requireUser(req("Bearer t"), verifyAs({ ok: true, lineUserId: lineA })).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(HttpError);
  });
});
