import { describe, expect, it } from "vitest";
import { appReturnPath, loginRedirectUri } from "./login-redirect";

describe("MINI App login callback", () => {
  it("falls back to the canonical endpoint for an unsafe or unrelated path", () => {
    expect(
      loginRedirectUri("https://example.com", "https://evil.example"),
    ).toBe("https://example.com/app");
    expect(loginRedirectUri("https://example.com", "/miniapp")).toBe(
      "https://example.com/app",
    );
  });
  it("logs in directly beneath the canonical /app endpoint", () => {
    const url = new URL(
      loginRedirectUri("https://example.com", "/app/consent"),
    );
    expect(url.pathname).toBe("/app/consent");
    expect(url.search).toBe("");
  });
  it.each([
    null,
    "https://evil.com/app",
    "//evil.com/app",
    "/app/../api",
    "/app/%2e%2e",
    "/app\\evil",
    "/app?token=secret",
    "/app#token",
    "/application",
  ])("rejects unsafe return destination %s", (value) => {
    expect(appReturnPath(value)).toBeNull();
  });
  it.each(["/app", "/app/", "/app/demo/ui"])("allows %s", (value) => {
    expect(appReturnPath(value)).toBe(value);
  });
});
