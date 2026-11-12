import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("@line/liff", () => ({ default: sdk }));
beforeEach(() => {
  vi.resetModules();
  sdk.init.mockReset();
});

describe("LIFF initialization", () => {
  it("rejects a different app ID rather than reusing the wrong initialized identity", async () => {
    sdk.init.mockResolvedValue(undefined);
    const { initializeLiff } = await import("./liff-client");
    await initializeLiff("test-miniapp");
    await expect(initializeLiff("different-login-app")).rejects.toThrow(
      "different app",
    );
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });
  it("initializes once for concurrent React effect calls", async () => {
    sdk.init.mockResolvedValue(undefined);
    const { initializeLiff } = await import("./liff-client");
    const [first, second] = await Promise.all([
      initializeLiff("test-liff-id"),
      initializeLiff("test-liff-id"),
    ]);
    expect(first).toBe(second);
    expect(sdk.init).toHaveBeenCalledExactlyOnceWith({
      liffId: "test-liff-id",
    });
  });
  it("allows retry after failed initialization", async () => {
    sdk.init
      .mockRejectedValueOnce(new Error("SDK unavailable"))
      .mockResolvedValueOnce(undefined);
    const { initializeLiff } = await import("./liff-client");
    await expect(initializeLiff("test-liff-id")).rejects.toThrow();
    await expect(initializeLiff("test-liff-id")).resolves.toBe(sdk);
    expect(sdk.init).toHaveBeenCalledTimes(2);
  });
});
