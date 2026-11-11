import { describe, expect, it } from "vitest";
import { daysBetween, thaiDate } from "@/lib/calc/time";

describe("thaiDate", () => {
  it("rolls over to the next day after 17:00 UTC (00:30 Thai)", () => {
    expect(thaiDate(new Date("2026-11-11T17:30:00Z"))).toBe("2026-11-12");
  });

  it("stays on the same day at 23:59:59 Thai", () => {
    expect(thaiDate(new Date("2026-11-11T16:59:59Z"))).toBe("2026-11-11");
  });
});

describe("daysBetween", () => {
  it("counts days forward", () => {
    expect(daysBetween("2026-11-11", "2026-11-23")).toBe(12);
  });

  it("returns 0 for the same day", () => {
    expect(daysBetween("2026-11-11", "2026-11-11")).toBe(0);
  });

  it("returns a negative number when to is before from", () => {
    expect(daysBetween("2026-11-11", "2026-11-10")).toBe(-1);
  });

  it("works across a year boundary", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});
