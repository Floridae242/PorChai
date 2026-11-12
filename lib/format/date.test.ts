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
  it('throws RangeError on impossible date "2026-02-30"', () => {
    expect(() => formatThaiDate("2026-02-30", "short")).toThrow(RangeError);
  });
  it('throws RangeError on non-padded "2026-1-5"', () => {
    expect(() => formatThaiDate("2026-1-5", "short")).toThrow(/YYYY-MM-DD/);
  });
});
