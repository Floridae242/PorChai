import { describe, expect, it } from "vitest";
import { formatBaht, formatBahtOrUnknown, parseBahtInput } from "./money";

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
    expect(parseBahtInput("45บาท")).toEqual({ ok: false, reason: "not_number" });
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
});
