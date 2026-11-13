import { describe, expect, it } from "vitest";
import { appReturnPath, loginRedirectUri } from "./login-redirect";

describe("MINI App login callback", () => {
  it("uses the approved endpoint and retains the app destination", () => {
    const url = new URL(
      loginRedirectUri("https://example.com", "/app/consent"),
    );
    expect(url.pathname).toBe("/miniapp");
    expect(url.searchParams.get("returnTo")).toBe("/app/consent");
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
