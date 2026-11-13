import { describe, expect, it } from "vitest";
import { nextPayday, weekdayOf } from "./payday";

// 2026-11-13 is a Friday.
const TODAY = "2026-11-13";

describe("weekdayOf", () => {
  it("knows the day of the week", () => {
    expect(weekdayOf("2026-11-13")).toBe(5); // Friday
    expect(weekdayOf("2026-11-15")).toBe(0); // Sunday
    expect(weekdayOf("2024-02-29")).toBe(4); // Thursday, leap day
  });
});

describe("nextPayday weekly", () => {
  it("picks the coming weekday this week", () => {
    expect(nextPayday({ kind: "weekly", weekday: 6 }, TODAY)).toBe("2026-11-14"); // Saturday
    expect(nextPayday({ kind: "weekly", weekday: 1 }, TODAY)).toBe("2026-11-16"); // Monday
    expect(nextPayday({ kind: "weekly", weekday: 0 }, TODAY)).toBe("2026-11-15"); // Sunday
  });
  it("today is the chosen weekday -> next week, never today", () => {
    expect(nextPayday({ kind: "weekly", weekday: 5 }, TODAY)).toBe("2026-11-20");
  });
  it("crosses month and year ends", () => {
    expect(nextPayday({ kind: "weekly", weekday: 1 }, "2026-12-29")).toBe("2027-01-04");
  });
  it("rejects a bad weekday", () => {
    expect(() => nextPayday({ kind: "weekly", weekday: 7 }, TODAY)).toThrow(RangeError);
    expect(() => nextPayday({ kind: "weekly", weekday: 1.5 }, TODAY)).toThrow(RangeError);
  });
});

describe("nextPayday monthly", () => {
  it("day still ahead this month -> this month", () => {
    expect(nextPayday({ kind: "monthly", day: 25 }, TODAY)).toBe("2026-11-25");
  });
  it("day already passed -> next month", () => {
    expect(nextPayday({ kind: "monthly", day: 5 }, TODAY)).toBe("2026-12-05");
  });
  it("today is the chosen day -> next month, never today", () => {
    expect(nextPayday({ kind: "monthly", day: 13 }, TODAY)).toBe("2026-12-13");
  });
  it("December rolls into January", () => {
    expect(nextPayday({ kind: "monthly", day: 5 }, "2026-12-20")).toBe("2027-01-05");
  });
  it("day 31 in a short month uses the last day", () => {
    expect(nextPayday({ kind: "monthly", day: 31 }, "2026-02-10")).toBe("2026-02-28");
    expect(nextPayday({ kind: "monthly", day: 31 }, "2028-02-10")).toBe("2028-02-29"); // leap year
    expect(nextPayday({ kind: "monthly", day: 31 }, "2026-04-10")).toBe("2026-04-30");
  });
  it("passed 31st rolls into a short next month", () => {
    expect(nextPayday({ kind: "monthly", day: 31 }, "2026-01-31")).toBe("2026-02-28");
    expect(nextPayday({ kind: "monthly", day: 30 }, "2026-01-31")).toBe("2026-02-28");
  });
  it("rejects a bad day", () => {
    expect(() => nextPayday({ kind: "monthly", day: 0 }, TODAY)).toThrow(RangeError);
    expect(() => nextPayday({ kind: "monthly", day: 32 }, TODAY)).toThrow(RangeError);
  });
});
