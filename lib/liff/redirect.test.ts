import { describe, expect, it } from "vitest";
import { shouldInitializeLegacyLiff } from "./redirect";

describe("legacy LIFF redirect ownership", () => {
  it("initializes a legacy root deep link", () => {
    expect(
      shouldInitializeLegacyLiff("/", "?liff.state=%2Fdev%2Fliff-check"),
    ).toBe(true);
  });

  it.each(["/miniapp", "/miniapp/"])(
    "leaves %s deep links to MINI App",
    (path) => {
      expect(shouldInitializeLegacyLiff(path, "?liff.state=%2F")).toBe(false);
    },
  );

  it("ignores ordinary visits", () => {
    expect(shouldInitializeLegacyLiff("/", "")).toBe(false);
  });
});
