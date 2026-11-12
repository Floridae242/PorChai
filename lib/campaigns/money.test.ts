import { describe, expect, it } from "vitest";
import { formatBaht, parseBaht } from "./money";

describe("campaign cost input", () => {
  it.each([["0", 0], ["5", 500], ["1.01", 101], ["12.5", 1250]])("parses %s baht exactly", (text, expected) => {
    expect(parseBaht(text)).toBe(expected);
  });
  it.each(["", "-1", "1.001", "1e3", "NaN", "1,000", "9007199254740991"])("rejects invalid amount %s", text => {
    expect(() => parseBaht(text)).toThrow();
  });
});

describe("campaign currency display", () => {
  it("preserves satang at the supported integer boundary", () => {
    expect(formatBaht(parseBaht("90071992547409.91"))).toBe("฿90,071,992,547,409.91");
  });
  it("shows losses and zero with two decimal places", () => {
    expect(formatBaht(-2500)).toBe("-฿25.00");
    expect(formatBaht(0)).toBe("฿0.00");
  });
});
