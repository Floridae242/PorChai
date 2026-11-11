import { describe, expect, it } from "vitest";
import { TIME_ZONE } from "@/lib/calc/time";

// Smoke test: proves Vitest and the "@/" alias work. Replace once real calc tests exist.
describe("test setup", () => {
  it("resolves the @/ alias", () => {
    expect(TIME_ZONE).toBe("Asia/Bangkok");
  });
});
