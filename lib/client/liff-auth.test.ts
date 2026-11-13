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

describe("createLiffAuth error wrapping", () => {
  beforeEach(() => window.sessionStorage.clear());
  const failing = () => createLiffAuth(() => Promise.reject(new Error("init boom")));

  it("getIdToken wraps liff.init rejection as ApiError liff", async () => {
    await expect(failing().getIdToken()).rejects.toMatchObject({ status: 0, code: "liff", message: "เชื่อมต่อ LINE ไม่ได้ ลองใหม่อีกครั้ง" });
  });
  it("refreshIdToken wraps rejection as ApiError liff", async () => {
    await expect(failing().refreshIdToken()).rejects.toMatchObject({ code: "liff" });
  });
  it("wraps a throwing liff call", async () => {
    const { auth } = fakeLiff({ isLoggedIn: vi.fn(() => { throw new Error("x"); }) });
    await expect(auth.getIdToken()).rejects.toMatchObject({ code: "liff" });
  });
});

describe("createLiffAuth.getIdToken login loop guard", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("logs in once, then throws 401 when still not logged in (flag set)", async () => {
    window.history.replaceState(null, "", "/app/consent");
    const { liff, auth } = fakeLiff({ isLoggedIn: vi.fn(() => false) });
    expect(await pending(auth.getIdToken())).toBe("pending");
    expect(liff.login).toHaveBeenCalledTimes(1);
    const callback = new URL(liff.login.mock.calls[0][0].redirectUri);
    expect(callback.pathname).toBe("/miniapp");
    expect(callback.searchParams.get("returnTo")).toBe("/app/consent");
    // a fresh page load: new auth instance, flag survives in sessionStorage
    const again = fakeLiff({ isLoggedIn: vi.fn(() => false) });
    await expect(again.auth.getIdToken()).rejects.toMatchObject({ status: 401, code: "unauthorized", message: "เข้าสู่ระบบ LINE ไม่สำเร็จ" });
    expect(again.liff.login).not.toHaveBeenCalled();
  });

  it("with storage blocked, attempts login once per page load", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      const { liff, auth } = fakeLiff({ isLoggedIn: vi.fn(() => false) });
      expect(await pending(auth.getIdToken())).toBe("pending");
      await expect(auth.getIdToken()).rejects.toMatchObject({ status: 401 });
      expect(liff.login).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      set.mockRestore();
    }
  });
});
