// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Liff } from "@line/liff";
import { createLiffAuth } from "./liff-auth";

function fakeLiff(over: Partial<Record<"isInClient" | "isLoggedIn" | "getIDToken", unknown>> = {}) {
  const liff = {
    isInClient: vi.fn(() => false),
    isLoggedIn: vi.fn(() => true),
    getIDToken: vi.fn(() => "tok"),
    login: vi.fn(),
    ...over,
  };
  return { liff, auth: createLiffAuth(() => Promise.resolve(liff as unknown as Liff)) };
}

const pending = (p: Promise<unknown>) =>
  Promise.race([p.then(() => "settled", () => "settled"), new Promise((r) => setTimeout(() => r("pending"), 20))]);

describe("createLiffAuth.refreshIdToken", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("throws 401 and never logs in inside the LINE client", async () => {
    const { liff, auth } = fakeLiff({ isInClient: vi.fn(() => true) });
    await expect(auth.refreshIdToken()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(liff.login).not.toHaveBeenCalled();
  });

  it("in an external browser logs in once, then throws on the second attempt", async () => {
    const { liff, auth } = fakeLiff();
    expect(await pending(auth.refreshIdToken())).toBe("pending");
    expect(liff.login).toHaveBeenCalledTimes(1);
    await expect(auth.refreshIdToken()).rejects.toMatchObject({ status: 401 });
    expect(liff.login).toHaveBeenCalledTimes(1);
  });

  it("clears the flag once a token is obtained", async () => {
    const { liff, auth } = fakeLiff();
    await pending(auth.refreshIdToken());
    expect(await auth.getIdToken()).toBe("tok");
    expect(await pending(auth.refreshIdToken())).toBe("pending");
    expect(liff.login).toHaveBeenCalledTimes(2);
  });
});

describe("createLiffAuth.getIdToken", () => {
  it("throws 401 when LINE gives no token", async () => {
    const { auth } = fakeLiff({ getIDToken: vi.fn(() => null) });
    await expect(auth.getIdToken()).rejects.toMatchObject({ status: 401, message: "เข้าสู่ระบบ LINE ไม่สำเร็จ" });
  });
});
