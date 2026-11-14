import { describe, expect, it } from "vitest";
import { floorToQuarter } from "@/lib/calc/money";

describe("floorToQuarter (25 satang = 0.25 baht, a สลึง)", () => {
  it("rounds down to the previous 25-satang step", () => {
    expect(floorToQuarter(23333.33)).toBe(23325); // 700 / 3 = 233.33 baht -> 233.25
    expect(floorToQuarter(24)).toBe(0);
    expect(floorToQuarter(99)).toBe(75);
  });
  it("keeps exact steps and zero", () => {
    expect(floorToQuarter(12000)).toBe(12000);
    expect(floorToQuarter(8650)).toBe(8650);
    expect(floorToQuarter(0)).toBe(0);
  });
  it("behaves like Math.floor for negatives", () => {
    expect(floorToQuarter(-1)).toBe(-25);
    expect(floorToQuarter(-25)).toBe(-25);
  });
});
