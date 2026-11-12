import { describe, expect, it } from "vitest";
import { formatBaht, formatBahtOrUnknown, parseBahtInput, satangToInputString } from "./money";

describe("formatBaht", () => {
  it("formats 240000 satang as 2,400", () => {
    expect(formatBaht(240000)).toBe("2,400");
  });
  it("formats 4500 satang as 45", () => {
    expect(formatBaht(4500)).toBe("45");
  });
  it("formats negative -2500 as -25", () => {
    expect(formatBaht(-2500)).toBe("-25");
  });
  it("shows 2 decimals when satang is non-zero (4550 -> 45.50)", () => {
    expect(formatBaht(4550)).toBe("45.50");
  });
  it("formats 0 as 0", () => {
    expect(formatBaht(0)).toBe("0");
  });
  it("formats 5 satang as 0.05", () => {
    expect(formatBaht(5)).toBe("0.05");
  });
  it("formats negative with satang -4550 as -45.50", () => {
    expect(formatBaht(-4550)).toBe("-45.50");
  });
  it("throws RangeError on a non-integer satang", () => {
    expect(() => formatBaht(45.5)).toThrow(RangeError);
  });
});

describe("formatBaht guards", () => {
  it("throws RangeError on 1e21 (unsafe integer)", () => {
    expect(() => formatBaht(1e21)).toThrow(RangeError);
  });
});

describe("formatBahtOrUnknown", () => {
  it("returns the label when satang is null", () => {
    expect(formatBahtOrUnknown(null, "ไม่ทราบ")).toBe("ไม่ทราบ");
  });
  it("formats the number when not null", () => {
    expect(formatBahtOrUnknown(240000, "ไม่ทราบ")).toBe("2,400");
  });
});

describe("parseBahtInput", () => {
  it('parses "1,200.50" as 120050', () => {
    expect(parseBahtInput("1,200.50")).toEqual({ ok: true, satang: 120050 });
  });
  it('parses " 45 " as 4500', () => {
    expect(parseBahtInput(" 45 ")).toEqual({ ok: true, satang: 4500 });
  });
  it("parses Thai digits ๔๕ as 4500", () => {
    expect(parseBahtInput("๔๕")).toEqual({ ok: true, satang: 4500 });
  });
  it('parses "0.29" as 29 without float error', () => {
    expect(parseBahtInput("0.29")).toEqual({ ok: true, satang: 29 });
  });
  it('rejects "45บาท" as not_number', () => {
    expect(parseBahtInput("45บาท")).toEqual({
      ok: false,
      reason: "not_number",
    });
  });
  it('rejects "-5" as not_positive', () => {
    expect(parseBahtInput("-5")).toEqual({ ok: false, reason: "not_positive" });
  });
  it('rejects "0" as not_positive', () => {
    expect(parseBahtInput("0")).toEqual({ ok: false, reason: "not_positive" });
  });
  it('rejects "1.234" as too_many_decimals', () => {
    expect(parseBahtInput("1.234")).toEqual({
      ok: false,
      reason: "too_many_decimals",
    });
  });
  it("rejects empty and whitespace as empty", () => {
    expect(parseBahtInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseBahtInput("   ")).toEqual({ ok: false, reason: "empty" });
  });
  it("rejects stray text like abc as not_number", () => {
    expect(parseBahtInput("abc")).toEqual({ ok: false, reason: "not_number" });
  });
  it('rejects "45,50" as not_number (bad grouping)', () => {
    expect(parseBahtInput("45,50")).toEqual({
      ok: false,
      reason: "not_number",
    });
  });
  it('rejects "1,2,3" as not_number', () => {
    expect(parseBahtInput("1,2,3")).toEqual({
      ok: false,
      reason: "not_number",
    });
  });
  it('rejects ",,45" as not_number', () => {
    expect(parseBahtInput(",,45")).toEqual({ ok: false, reason: "not_number" });
  });
  it('parses "1,200" as 120000', () => {
    expect(parseBahtInput("1,200")).toEqual({ ok: true, satang: 120000 });
  });
  it('parses "12,345,678.90" as 1234567890', () => {
    expect(parseBahtInput("12,345,678.90")).toEqual({
      ok: true,
      satang: 1234567890,
    });
  });
  it('parses ".5" as 50', () => {
    expect(parseBahtInput(".5")).toEqual({ ok: true, satang: 50 });
  });
  it('parses "45." as 4500', () => {
    expect(parseBahtInput("45.")).toEqual({ ok: true, satang: 4500 });
  });
  it('rejects "." and "-" as not_number', () => {
    expect(parseBahtInput(".")).toEqual({ ok: false, reason: "not_number" });
    expect(parseBahtInput("-")).toEqual({ ok: false, reason: "not_number" });
  });
  it('rejects "99999999999999999999" as too_large', () => {
    expect(parseBahtInput("99999999999999999999")).toEqual({
      ok: false,
      reason: "too_large",
    });
  });
  it('rejects "-0" and "0.00" as not_positive', () => {
    expect(parseBahtInput("-0")).toEqual({ ok: false, reason: "not_positive" });
    expect(parseBahtInput("0.00")).toEqual({
      ok: false,
      reason: "not_positive",
    });
  });
  it('rejects "-1.234" as too_many_decimals (decimals checked before sign)', () => {
    expect(parseBahtInput("-1.234")).toEqual({
      ok: false,
      reason: "too_many_decimals",
    });
  });
});

describe("satangToInputString", () => {
  it("drops zero satang and trailing zeros", () => {
    expect(satangToInputString(4550)).toBe("45.5");
    expect(satangToInputString(4500)).toBe("45");
    expect(satangToInputString(0)).toBe("0");
  });
  it("pads small satang and has no thousands separators", () => {
    expect(satangToInputString(5)).toBe("0.05");
    expect(satangToInputString(120050)).toBe("1200.5");
    expect(satangToInputString(240000)).toBe("2400");
  });
  it("round-trips through parseBahtInput", () => {
    for (const v of [5, 4550, 4500, 120050, 99999]) {
      expect(parseBahtInput(satangToInputString(v))).toEqual({ ok: true, satang: v });
    }
  });
  it("throws RangeError on negative or non-integer", () => {
    expect(() => satangToInputString(-1)).toThrow(RangeError);
    expect(() => satangToInputString(45.5)).toThrow(RangeError);
    expect(() => satangToInputString(Number.NaN)).toThrow(RangeError);
  });
});
