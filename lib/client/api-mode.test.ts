import { describe, expect, it } from "vitest";
import { parseScenario, resolveApiMode } from "./api-mode";

describe("resolveApiMode", () => {
  it("honours an explicit value", () => {
    expect(resolveApiMode("live", "development")).toBe("live");
    expect(resolveApiMode("mock", "production")).toBe("mock");
  });
  it("defaults to mock outside production and live in production", () => {
    expect(resolveApiMode(undefined, "development")).toBe("mock");
    expect(resolveApiMode(undefined, "test")).toBe("mock");
    expect(resolveApiMode(undefined, "production")).toBe("live");
  });
  it("ignores an invalid value and uses the default", () => {
    expect(resolveApiMode("banana", "production")).toBe("live");
    expect(resolveApiMode("", "development")).toBe("mock");
  });
});

describe("parseScenario", () => {
  it("reads a valid ?scenario= and falls back to default", () => {
    expect(parseScenario("?scenario=shortfall")).toBe("shortfall");
    expect(parseScenario("?scenario=nope")).toBe("default");
    expect(parseScenario("")).toBe("default");
  });
});
