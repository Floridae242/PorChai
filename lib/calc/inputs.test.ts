import { describe, expect, it } from "vitest";
import { baht } from "@/lib/calc/money";
import {
  balanceNow,
  heldThisCycle,
  latestAnchor,
  reservedTotal,
  savingsFromPercent,
  spentOnDay,
  type PlanLike,
} from "@/lib/calc/inputs";

const at = (iso: string) => new Date(iso);

// Thai 08:10 on 1 Nov = 01:10 UTC
const START = { amount: baht(2400), asOf: at("2026-11-01T01:10:00Z") };

describe("latestAnchor", () => {
  it("is the cycle's starting balance when there are no checks", () => {
    expect(latestAnchor(START, [])).toEqual(START);
  });

  it("is the check with the latest as-of time, whatever order they come in", () => {
    const a = { amount: baht(2000), asOf: at("2026-11-03T05:00:00Z") };
    const b = { amount: baht(1800), asOf: at("2026-11-05T05:00:00Z") };
    expect(latestAnchor(START, [b, a])).toEqual(b);
  });
});

describe("balanceNow", () => {
  it("W10: 2,400 minus rice 45 logged after the start is 2,355", () => {
    const entries = [{ amount: baht(45), spentOn: "2026-11-01", createdAt: at("2026-11-01T05:00:00Z") }];
    expect(balanceNow(START, entries)).toBe(baht(2355));
  });

  it("W5: spending logged later but made after the as-of time still counts", () => {
    // Balance seen 08:10, coffee at 09:00, logged at 10:00
    const entries = [{ amount: baht(55), spentOn: "2026-11-01", createdAt: at("2026-11-01T03:00:00Z") }];
    expect(balanceNow(START, entries)).toBe(baht(2345));
  });

  it("R01: entries logged before a balance check are already inside it — not taken twice", () => {
    const check = { amount: baht(2000), asOf: at("2026-11-03T05:00:00Z") };
    const entries = [
      { amount: baht(45), spentOn: "2026-11-02", createdAt: at("2026-11-02T05:00:00Z") },
      { amount: baht(60), spentOn: "2026-11-03", createdAt: at("2026-11-03T04:00:00Z") },
    ];
    expect(balanceNow(check, entries)).toBe(baht(2000));
  });

  it("R01: deleting or editing an entry from before the check does not move the checked balance", () => {
    const check = { amount: baht(2000), asOf: at("2026-11-03T05:00:00Z") };
    const before = [{ amount: baht(45), spentOn: "2026-11-02", createdAt: at("2026-11-02T05:00:00Z") }];
    const edited = [{ amount: baht(450), spentOn: "2026-11-02", createdAt: at("2026-11-02T05:00:00Z") }];
    expect(balanceNow(check, before)).toBe(balanceNow(check, []));
    expect(balanceNow(check, edited)).toBe(baht(2000));
  });

  it("entries logged after the check are taken off it", () => {
    const check = { amount: baht(2000), asOf: at("2026-11-03T05:00:00Z") };
    const entries = [{ amount: baht(80), spentOn: "2026-11-03", createdAt: at("2026-11-03T06:00:00Z") }];
    expect(balanceNow(check, entries)).toBe(baht(1920));
  });

  it("R01: a forgotten spend from an earlier day, logged after the check, is already inside it", () => {
    const check = { amount: baht(2000), asOf: at("2026-11-03T05:00:00Z") };
    const entries = [{ amount: baht(40), spentOn: "2026-11-02", createdAt: at("2026-11-03T06:00:00Z") }];
    expect(balanceNow(check, entries)).toBe(baht(2000));
  });

  it("the check day is the Thai date: 00:30 Thai on 4 Nov is 3 Nov 17:30 UTC", () => {
    const check = { amount: baht(2000), asOf: at("2026-11-03T17:30:00Z") };
    const entries = [
      { amount: baht(30), spentOn: "2026-11-03", createdAt: at("2026-11-03T18:00:00Z") },
      { amount: baht(20), spentOn: "2026-11-04", createdAt: at("2026-11-03T18:00:00Z") },
    ];
    expect(balanceNow(check, entries)).toBe(baht(1980));
  });
});

describe("reservedTotal", () => {
  const payday = "2026-11-13";
  const plan = (over: Partial<PlanLike>): PlanLike => ({
    amount: baht(100),
    status: "reserved",
    dueOn: null,
    ...over,
  });

  it("W5: an unpaid bill is reserved", () => {
    expect(reservedTotal([plan({ amount: baht(600) })], payday)).toBe(baht(600));
  });

  it("W5: a bill already paid, or paid from other money, is not taken again", () => {
    const plans = [plan({ status: "paid" }), plan({ status: "separate" }), plan({ status: "cancelled" })];
    expect(reservedTotal(plans, payday)).toBe(0);
  });

  it("W8: an item due after payday belongs to next cycle", () => {
    expect(reservedTotal([plan({ dueOn: "2026-11-20" })], payday)).toBe(0);
  });

  it("an item due on payday itself is still reserved (never show more money than there is)", () => {
    expect(reservedTotal([plan({ dueOn: payday })], payday)).toBe(baht(100));
  });

  it("adds every reserved item due before payday", () => {
    const plans = [plan({ amount: baht(600), dueOn: "2026-11-05" }), plan({ amount: baht(480) })];
    expect(reservedTotal(plans, payday)).toBe(baht(1080));
  });

  it("W15: an item postponed to next cycle holds nothing back now", () => {
    expect(reservedTotal([plan({ status: "postponed" })], payday)).toBe(0);
  });
});

describe("heldThisCycle", () => {
  const payday = "2026-11-13";
  it("is the same rule reservedTotal sums", () => {
    expect(heldThisCycle({ status: "reserved", dueOn: null }, payday)).toBe(true);
    expect(heldThisCycle({ status: "reserved", dueOn: payday }, payday)).toBe(true);
    expect(heldThisCycle({ status: "reserved", dueOn: "2026-11-14" }, payday)).toBe(false);
    expect(heldThisCycle({ status: "postponed", dueOn: null }, payday)).toBe(false);
    expect(heldThisCycle({ status: "paid", dueOn: null }, payday)).toBe(false);
  });
});

describe("savingsFromPercent", () => {
  it("W6: 10% of 2,400 is 240", () => {
    expect(savingsFromPercent(baht(2400), 10)).toBe(baht(240));
  });

  it("floors to whole baht: 15% of 1,999 is 299 (not 299.85)", () => {
    expect(savingsFromPercent(baht(1999), 15)).toBe(baht(299));
  });
});

describe("spentOnDay", () => {
  const e = (amount: number, spentOn: string, fromPlan = false) => ({
    amount: baht(amount),
    spentOn,
    createdAt: at("2026-11-01T05:00:00Z"),
    fromPlan,
  });

  it("adds the day's chat and form spending", () => {
    expect(spentOnDay([e(45, "2026-11-01"), e(55, "2026-11-01"), e(30, "2026-10-31")], "2026-11-01")).toBe(
      baht(100),
    );
  });

  it("FR06/W15: paying a plan is not day spending — its money was already held back", () => {
    expect(spentOnDay([e(45, "2026-11-01"), e(600, "2026-11-01", true)], "2026-11-01")).toBe(baht(45));
  });
});
