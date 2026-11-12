import { describe, expect, it } from "vitest";
import { formatThaiDate } from "./date";

describe("formatThaiDate", () => {
  it('short: "2026-11-23" -> "23 พ.ย."', () => {
    expect(formatThaiDate("2026-11-23", "short")).toBe("23 พ.ย.");
  });
  it('long: "2026-11-23" -> "23 พฤศจิกายน 2569"', () => {
    expect(formatThaiDate("2026-11-23", "long")).toBe("23 พฤศจิกายน 2569");
  });
  it("never drifts a day regardless of machine timezone (month edges)", () => {
    expect(formatThaiDate("2026-11-01", "short")).toBe("1 พ.ย.");
    expect(formatThaiDate("2026-12-31", "long")).toBe("31 ธันวาคม 2569");
  });
});
