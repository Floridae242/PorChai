import { describe, it, expect } from "vitest";
import { monthDue, moveMonth, parseBillSchedule, validDate } from "./calendar";
const input = {
  title: " ค่าหอ ",
  amount: 300000,
  startsOn: "2026-11-30",
  repeat: "monthly",
  notify: false,
};
describe("bill calendar dates and input boundary", () => {
  it.each([
    ["2027-02", 31, "2027-02-28"],
    ["2028-02", 31, "2028-02-29"],
    ["2027-04", 31, "2027-04-30"],
    ["2027-03", 31, "2027-03-31"],
  ])("clamps %s but keeps the supplied anchor", (month, day, expected) =>
    expect(monthDue(month, Number(day))).toBe(expected),
  );
  it("moves across years without local timezone drift", () => {
    expect(moveMonth("2026-12", 1)).toBe("2027-01");
    expect(moveMonth("2027-01", -1)).toBe("2026-12");
  });
  it("accepts explicit opt-in and trims titles", () =>
    expect(parseBillSchedule(input, "2026-11-15")).toMatchObject({
      title: "ค่าหอ",
      notify: false,
    }));
  it.each([
    { amount: 0 },
    { amount: -1 },
    { amount: 1.5 },
    { amount: 10000001 },
    { title: " " },
    { title: "x".repeat(81) },
    { startsOn: "2026-02-30" },
    { startsOn: "2026-11-14" },
    { startsOn: "2028-01-01" },
    { repeat: "weekly" },
    { notify: "true" },
    { startsOn: null },
  ])("rejects invalid schedule %j", (bad) =>
    expect(() =>
      parseBillSchedule({ ...input, ...bad }, "2026-11-15"),
    ).toThrow(),
  );
  it.each([null, [], "2026-2-1", "2101-01-01", "1999-01-01", "2027-02-29"])(
    "rejects malformed dates %j",
    (date) => expect(validDate(date)).toBe(false),
  );
});
