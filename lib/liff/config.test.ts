import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("LIFF deployment configuration", () => {
  it("creates native permanent links relative to /app, preserving the entry ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545254-6025ZG1r");
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "2012545254");
    vi.resetModules();
    const { appUrl } = await import("./config");
    expect(appUrl("/app")).toBe("https://miniapp.line.me/2012545254-6025ZG1r");
    expect(appUrl("/app/record/entry-123")).toBe(
      "https://miniapp.line.me/2012545254-6025ZG1r/record/entry-123",
    );
    expect(() => appUrl("//evil.example")).toThrow();
  });
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
