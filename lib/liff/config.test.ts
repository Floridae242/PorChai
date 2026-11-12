import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("LIFF deployment configuration", () => {
  it("uses the configured MINI App ID for the frontend and redirect bridge", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545254-6025ZG1r");
    vi.resetModules();
    expect((await import("./config")).LIFF_ID).toBe("2012545254-6025ZG1r");
  });

  it("retains the standalone Login fallback when no ID is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "");
    vi.resetModules();
    expect((await import("./config")).LIFF_ID).toBe("2012545176-udYyTUiA");
  });
});
