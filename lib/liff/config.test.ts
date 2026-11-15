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

  it("defaults to the canonical MINI App instead of silently opening a different Login channel", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "");
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "");
    vi.resetModules();
    const c = await import("./config");
    expect(c.LIFF_ID).toBe("2012545254-6025ZG1r");
    expect(c.appUrl()).toBe("https://miniapp.line.me/2012545254-6025ZG1r");
  });
  it("keeps an explicitly configured standalone LIFF channel working", async () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545176-udYyTUiA");
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "2012545254");
    vi.resetModules();
    expect((await import("./config")).appUrl()).toBe(
      "https://liff.line.me/2012545176-udYyTUiA",
    );
  });
});
