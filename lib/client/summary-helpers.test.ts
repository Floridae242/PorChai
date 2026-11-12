import { describe, expect, it } from "vitest";
import { buildDailyBars } from "./summary-helpers";

describe("buildDailyBars (chart scaling only)", () => {
  const days = [
    { date: "2026-11-01", spent: 10000, over: false },
    { date: "2026-11-02", spent: 30000, over: true },
    { date: "2026-11-03", spent: 0, over: false },
    { date: "2026-11-04", spent: null, over: false },
  ];

  it("keeps the server's amounts and over flags untouched", () => {
    const bars = buildDailyBars(days, "2026-11-03", 12000);
    expect(bars.map((b) => b.spent)).toEqual([10000, 30000, 0, null]);
    expect(bars.map((b) => b.over)).toEqual([false, true, false, false]);
    expect(bars.map((b) => b.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(bars.map((b) => b.isToday)).toEqual([false, false, true, false]);
  });

  it("scales heights relative to the largest value and gives empty/future days a stub", () => {
    const bars = buildDailyBars(days, "2026-11-03", 12000);
    expect(bars[1].heightPercent).toBe(100);
    expect(bars[0].heightPercent).toBeLessThan(bars[1].heightPercent);
    expect(bars[2].heightPercent).toBe(6);
    expect(bars[3].heightPercent).toBe(6);
  });

  it("works without a daily budget and with no days", () => {
    expect(buildDailyBars(days, "2026-11-03", null)).toHaveLength(4);
    expect(buildDailyBars([], "2026-11-03", null)).toEqual([]);
  });
});
