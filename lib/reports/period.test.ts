import { describe, expect, it } from "vitest";
import { reportRange } from "./period";
describe("Thai calendar report selection", () => {
  it("uses Thai today, including UTC midnight boundaries", () => {
    expect(
      reportRange("day", undefined, new Date("2026-11-15T17:00:00Z")),
    ).toEqual({
      period: "day",
      from: "2026-11-16",
      until: "2026-11-17",
      asOf: "2026-11-16",
    });
  });
  it.each([
    ["2024-02-10", "2024-02-01", "2024-03-01"],
    ["2025-02-28", "2025-02-01", "2025-03-01"],
    ["2025-12-31", "2025-12-01", "2026-01-01"],
  ])("handles month lengths for %s", (date, from, until) => {
    expect(
      reportRange("month", date, new Date("2026-11-15T00:00:00Z")),
    ).toMatchObject({ from, until });
  });
  it.each(["2026-02-30", "2026-13-01", "bad", "2026-2-1", "2027-01-01"])(
    "rejects invalid/future date %s",
    (date) => {
      expect(() =>
        reportRange("day", date, new Date("2026-11-15T00:00:00Z")),
      ).toThrow();
    },
  );
  it("does not silently coerce an unsupported period", () =>
    expect(() => reportRange("year", "2026-11-01")).toThrow());
  // «สัปดาห์นี้ใช้ไปเท่าไร» (15 Nov): Monday to today, the team's choice
  it.each([
    ["2026-11-15", "2026-11-09", "2026-11-16"], // Sunday: the week that began on Monday the 9th
    ["2026-11-16", "2026-11-16", "2026-11-23"], // Monday starts a new week
    ["2026-12-02", "2026-11-30", "2026-12-07"], // across a month boundary
  ])("a week holding %s runs Monday %s until %s", (date, from, until) => {
    expect(reportRange("week", date, new Date("2026-12-02T05:00:00Z"))).toMatchObject({ period: "week", from, until });
  });
});
