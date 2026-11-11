import { describe, expect, it } from "vitest";
import { baht } from "@/lib/calc/money";
import { computeBudget, simulatePurchase, type BudgetInput } from "@/lib/calc/budget";

const TODAY = "2026-11-11";

// Base input: nothing spent or reserved, payday `days` days after TODAY.
function input(over: Partial<BudgetInput> & { days?: number } = {}): BudgetInput {
  const { days = 10, ...rest } = over;
  const payday = new Date(Date.UTC(2026, 10, 11 + days)).toISOString().slice(0, 10);
  return {
    startBalance: 0,
    spentBeforeToday: 0,
    spentToday: 0,
    emergencyBuffer: 0,
    reserved: 0,
    today: TODAY,
    payday,
    ...rest,
  };
}

describe("computeBudget", () => {
  it("demo: 2,400 start, 600 reserved, 12 days", () => {
    const r = computeBudget(input({ startBalance: baht(2400), reserved: baht(600), payday: "2026-11-23" }));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(150), todayRemaining: baht(150), daysLeft: 12 });
  });

  it("demo: logging a 45 baht meal keeps the daily budget and lowers today's remainder", () => {
    const r = computeBudget(
      input({ startBalance: baht(2400), reserved: baht(600), spentToday: baht(45), payday: "2026-11-23" }),
    );
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(150), todayRemaining: baht(105) });
  });

  it("FR03: simulating a purchase does not mutate the input", () => {
    const base = input({ startBalance: baht(1960), emergencyBuffer: baht(210), days: 7 });
    const r = simulatePurchase(base, baht(700));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(150) });
    expect(base.reserved).toBe(0);
  });

  it("FR04: cancelling a reservation raises the daily budget", () => {
    const withBill = input({ startBalance: baht(1960), emergencyBuffer: baht(210), reserved: baht(350), days: 10 });
    expect(computeBudget(withBill)).toMatchObject({ kind: "ok", dailyBudget: baht(140) });
    expect(computeBudget({ ...withBill, reserved: 0 })).toMatchObject({ kind: "ok", dailyBudget: baht(175) });
  });

  it("FR06: paying a reserved bill changes nothing", () => {
    const before = input({ startBalance: baht(2000), reserved: baht(500), days: 10 });
    const after = { ...before, spentBeforeToday: baht(500), reserved: 0 };
    const a = computeBudget(before);
    const b = computeBudget(after);
    expect(b).toEqual(a);
    expect(a).toMatchObject({ kind: "ok", usable: baht(1500), dailyBudget: baht(150) });
  });

  it("DR01: payday today is payday-passed", () => {
    const r = computeBudget(input({ startBalance: baht(1000), days: 0 }));
    expect(r).toMatchObject({ kind: "payday-passed" });
  });

  it("DR01: payday in the past is payday-passed", () => {
    const r = computeBudget(input({ startBalance: baht(1000), days: -1 }));
    expect(r).toMatchObject({ kind: "payday-passed" });
  });

  it("payday-passed wins over shortfall", () => {
    const r = computeBudget(input({ startBalance: baht(100), reserved: baht(800), days: 0 }));
    expect(r.kind).toBe("payday-passed");
  });

  it("DR01: negative usable is a shortfall", () => {
    const r = computeBudget(input({ startBalance: baht(500), reserved: baht(800), days: 5 }));
    expect(r).toMatchObject({ kind: "shortfall", shortfall: baht(300), daysLeft: 5 });
  });

  it("floors to whole baht: 1,000 over 3 days is 333", () => {
    const r = computeBudget(input({ startBalance: baht(1000), days: 3 }));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(333) });
  });

  it("floors, never rounds up: 2,000 over 3 days is 666 (not 667)", () => {
    const r = computeBudget(input({ startBalance: baht(2000), days: 3 }));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(666) });
  });

  it("overspending today gives a negative todayRemaining", () => {
    const r = computeBudget(input({ startBalance: baht(1000), days: 10, spentToday: baht(150) }));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(100), todayRemaining: baht(-50) });
  });
});
