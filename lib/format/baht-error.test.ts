import { describe, expect, it } from "vitest";
import { bahtErrorMessage } from "./baht-error";
import { parseBahtInput } from "./money";

describe("bahtErrorMessage", () => {
  it("has a distinct Thai message for every parse failure reason", () => {
    const inputs = ["", "abc", "0", "1.234", "99999999999999999999"];
    const msgs = inputs.map((i) => {
      const r = parseBahtInput(i);
      if (r.ok) throw new Error("expected failure");
      return bahtErrorMessage(r.reason);
    });
    expect(new Set(msgs).size).toBe(5);
    for (const m of msgs) expect(m).toMatch(/[฀-๿]/);
  });
});
