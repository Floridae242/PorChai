import { beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn().mockResolvedValue(undefined);
vi.mock("@line/liff", () => ({ default: { init } }));

describe("getLiff", () => {
  beforeEach(() => {
    init.mockClear();
    vi.resetModules();
  });

  it("calls liff.init once however many times it is called", async () => {
    const { getLiff } = await import("./client");
    const { initializeLiff } = await import("@/lib/line/liff-client");
    const [a, b] = await Promise.all([getLiff(), getLiff()]);
    await initializeLiff("2012545176-udYyTUiA");
    await getLiff();
    expect(a).toBe(b);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({ liffId: "2012545176-udYyTUiA" });
  });

  it("lets a failed init be retried", async () => {
    init.mockRejectedValueOnce(new Error("boom"));
    const { getLiff } = await import("./client");
    await expect(getLiff()).rejects.toThrow("boom");
    await expect(getLiff()).resolves.toBeDefined();
    expect(init).toHaveBeenCalledTimes(2);
  });
});
