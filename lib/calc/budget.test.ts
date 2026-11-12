import { describe, expect, it } from "vitest";
import { baht } from "@/lib/calc/money";
import { reservedTotal, type PlanLike } from "@/lib/calc/inputs";
import {
  computeBudget,
  simulatePurchase,
  tomorrowBudget,
  tryOut,
  type BudgetInput,
} from "@/lib/calc/budget";

const TODAY = "2026-11-11";

// Base input: nothing spent, reserved or set aside, payday `days` days after TODAY.
function input(over: Partial<BudgetInput> & { days?: number } = {}): BudgetInput {
  const { days = 10, ...rest } = over;
  const payday = new Date(Date.UTC(2026, 10, 11 + days)).toISOString().slice(0, 10);
  return {
    balance: 0,
    spentToday: 0,
    emergencyBuffer: 0,
    savings: 0,
    reserved: 0,
    essentialPerDay: null,
    today: TODAY,
    payday,
    ...rest,
  };
}

// Figma demo cycle: 2,400 on hand, bill 600, savings 10% = 240, buffer 120,
// food 50 + transport 20 a day, 12 days to payday.
// `spent` is what was logged today; balance is money on hand after it.
function figma(spent = 0): BudgetInput {
  return input({
    balance: baht(2400) - spent,
    spentToday: spent,
    reserved: baht(600),
    savings: baht(240),
    emergencyBuffer: baht(120),
    essentialPerDay: baht(70),
    days: 12,
  });
}

// Team central example (ตัวอย่างกลาง 1,000, confirmed 11 Nov): 1,000 on hand · payday in 10 days ·
// essentials 70 a day (food 50 + transport 20) · plans: equipment 250, activity 200 (W8, can be
// postponed past payday) · no bills, savings or buffer.
describe("central example 1,000 — cards 03 / 14 / 57 / 23", () => {
  const equipment = (status: PlanLike["status"] = "reserved"): PlanLike => ({ amount: baht(250), status, dueOn: null });
  const activity = (dueOn: string | null = null): PlanLike => ({ amount: baht(200), status: "reserved", dueOn });

  function central(over: { balance?: number; plans?: PlanLike[]; days?: number } = {}): BudgetInput {
    const days = over.days ?? 10;
    const base = input({ balance: over.balance ?? baht(1000), essentialPerDay: baht(70), days });
    return { ...base, reserved: reservedTotal(over.plans ?? [equipment(), activity()], base.payday) };
  }

  it("card 14: doing every plan as is leaves 150 short of the essentials", () => {
    expect(computeBudget(central())).toMatchObject({ kind: "ok", spare: baht(-150), maxPurchase: 0 });
  });

  it("card 14: the daily average is not shown as money to spend on extras", () => {
    const r = computeBudget(central());
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(55), maxPurchase: 0 });
  });

  it("card 14: postponing the 200 activity past payday leaves 50 to spare", () => {
    const r = computeBudget(central({ plans: [equipment(), activity("2026-11-25")] }));
    expect(r).toMatchObject({ kind: "ok", spare: baht(50), maxPurchase: baht(50) });
  });

  it("card 57: choosing the equipment plan keeps real money at 1,000 and holds 250", () => {
    const chosen = central({ plans: [equipment()] });
    expect(chosen).toMatchObject({ balance: baht(1000), reserved: baht(250) });
  });

  it("card 57: paying it leaves 750 real money and nothing held for it — same spare as before", () => {
    const chosen = central({ plans: [equipment()] });
    const paid = central({ balance: baht(750), plans: [equipment("paid")] });
    expect(paid).toMatchObject({ balance: baht(750), reserved: 0 });
    expect(computeBudget(paid)).toEqual(computeBudget(chosen));
  });

  it("card 57: cancelling an unpaid plan only releases what it held — no income appears", () => {
    const cancelled = central({ plans: [equipment("cancelled"), activity()] });
    expect(cancelled).toMatchObject({ balance: baht(1000), reserved: baht(200) });
  });

  it("card 23: payday 2 days late adds 140 of essentials — the 50 spare becomes 90 short", () => {
    const r = computeBudget(central({ plans: [equipment(), activity("2026-11-25")], days: 12 }));
    expect(r).toMatchObject({ kind: "ok", spare: baht(-90) });
  });
});

describe("computeBudget — Figma demo numbers", () => {
  it("W6/W9: (2,400 − 600 − 240 − 120) ÷ 12 = 120 a day", () => {
    expect(computeBudget(figma())).toMatchObject({
      kind: "ok",
      usable: baht(1440),
      dailyBudget: baht(120),
      todayRemaining: baht(120),
      daysLeft: 12,
    });
  });

  it("W7: one item can cost at most 1,440 − 70 × 12 = 600", () => {
    expect(computeBudget(figma())).toMatchObject({ kind: "ok", maxPurchase: baht(600) });
  });

  it("W10/L2/F1: rice 45 leaves 75 today, money on hand 2,355", () => {
    const r = computeBudget(figma(baht(45)));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(120), todayRemaining: baht(75) });
    expect(figma(baht(45)).balance).toBe(baht(2355));
  });

  it("W12: the purchase limit stays 600 after rice 45 (start-of-day basis, like the daily budget)", () => {
    expect(computeBudget(figma(baht(45)))).toMatchObject({ kind: "ok", maxPurchase: baht(600) });
  });

  it("F3: lunch 50 leaves 70 today", () => {
    expect(computeBudget(figma(baht(50)))).toMatchObject({ kind: "ok", todayRemaining: baht(70) });
  });

  it("L10: rice 45 + coffee 55 leaves 20 today", () => {
    expect(computeBudget(figma(baht(100)))).toMatchObject({ kind: "ok", todayRemaining: baht(20) });
  });

  it("L6: shabu 350 is 230 over today's 120", () => {
    expect(computeBudget(figma(baht(350)))).toMatchObject({
      kind: "ok",
      dailyBudget: baht(120),
      todayRemaining: baht(-230),
    });
  });

  it("savings and buffer are not touched by spending", () => {
    const r = computeBudget(figma(baht(350)));
    expect(r).toMatchObject({ kind: "ok", usable: baht(1090) });
  });
});

describe("simulatePurchase — Figma demo numbers", () => {
  it("L4/W12: shoes 480 → 80 a day, nothing else lacking", () => {
    expect(simulatePurchase(figma(), baht(480))).toMatchObject({
      kind: "ok",
      dailyBudget: baht(80),
      essentialShortPerDay: 0,
    });
  });

  it("L5: shoes 250 → 99 a day ((1,440 − 250) ÷ 12, floored)", () => {
    expect(simulatePurchase(figma(), baht(250))).toMatchObject({ kind: "ok", dailyBudget: baht(99) });
  });

  it("W14: headphones 700 → 61 a day, 9 short of the 70 essentials", () => {
    expect(simulatePurchase(figma(), baht(700))).toMatchObject({
      kind: "ok",
      dailyBudget: baht(61),
      essentialShortPerDay: baht(9),
      maxPurchase: 0,
    });
  });

  it("W14: a purchase never eats into savings or the buffer", () => {
    const r = simulatePurchase(figma(), baht(700));
    expect(r).toMatchObject({ kind: "ok", usable: baht(740) });
  });

  it("buying exactly the limit leaves exactly the essentials", () => {
    expect(simulatePurchase(figma(), baht(600))).toMatchObject({
      kind: "ok",
      dailyBudget: baht(70),
      essentialShortPerDay: 0,
    });
  });
});

describe("tomorrowBudget", () => {
  it("L6: after shabu 350, tomorrow is (1,440 − 350) ÷ 11 = 99", () => {
    expect(tomorrowBudget(figma(baht(350)))).toMatchObject({
      kind: "ok",
      dailyBudget: baht(99),
      todayRemaining: baht(99),
      daysLeft: 11,
    });
  });

  it("the last day before payday has no tomorrow budget", () => {
    expect(tomorrowBudget(input({ balance: baht(100), days: 1 }))).toMatchObject({
      kind: "payday-passed",
    });
  });
});

describe("computeBudget", () => {
  it("demo: 2,400 start, 600 reserved, 12 days", () => {
    const r = computeBudget(input({ balance: baht(2400), reserved: baht(600), payday: "2026-11-23" }));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(150), todayRemaining: baht(150), daysLeft: 12 });
  });

  it("demo: logging a 45 baht meal keeps the daily budget and lowers today's remainder", () => {
    const r = computeBudget(
      input({ balance: baht(2355), reserved: baht(600), spentToday: baht(45), payday: "2026-11-23" }),
    );
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(150), todayRemaining: baht(105) });
  });

  it("FR03: simulating a purchase does not mutate the input", () => {
    const base = input({ balance: baht(1960), emergencyBuffer: baht(210), days: 7 });
    const r = simulatePurchase(base, baht(700));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(150) });
    expect(base.reserved).toBe(0);
  });

  it("FR04: cancelling a reservation raises the daily budget", () => {
    const withBill = input({ balance: baht(1960), emergencyBuffer: baht(210), reserved: baht(350), days: 10 });
    expect(computeBudget(withBill)).toMatchObject({ kind: "ok", dailyBudget: baht(140) });
    expect(computeBudget({ ...withBill, reserved: 0 })).toMatchObject({ kind: "ok", dailyBudget: baht(175) });
  });

  it("FR06: paying a reserved bill changes nothing", () => {
    const before = input({ balance: baht(2000), reserved: baht(500), days: 10 });
    const after = { ...before, balance: baht(1500), reserved: 0 };
    const a = computeBudget(before);
    const b = computeBudget(after);
    expect(b).toEqual(a);
    expect(a).toMatchObject({ kind: "ok", usable: baht(1500), dailyBudget: baht(150) });
  });

  it("W15: paying shoes 480 as a plan (not day spending) leaves 80 a day", () => {
    const paid = { ...figma(), balance: baht(2400 - 480) };
    expect(computeBudget(paid)).toMatchObject({ kind: "ok", dailyBudget: baht(80), todayRemaining: baht(80) });
  });

  it("card 23: a later payday spreads the money thinner and raises the essentials needed", () => {
    const onTime = figma();
    const late = { ...onTime, payday: "2026-11-26" }; // 15 days instead of 12
    expect(computeBudget(late)).toMatchObject({ kind: "ok", dailyBudget: baht(96), maxPurchase: baht(390) });
  });

  it("DR01: payday today is payday-passed", () => {
    const r = computeBudget(input({ balance: baht(1000), days: 0 }));
    expect(r).toMatchObject({ kind: "payday-passed" });
  });

  it("DR01: payday in the past is payday-passed", () => {
    const r = computeBudget(input({ balance: baht(1000), days: -1 }));
    expect(r).toMatchObject({ kind: "payday-passed" });
  });

  it("payday-passed wins over shortfall", () => {
    const r = computeBudget(input({ balance: baht(100), reserved: baht(800), days: 0 }));
    expect(r.kind).toBe("payday-passed");
  });

  it("DR01: negative usable is a shortfall", () => {
    const r = computeBudget(input({ balance: baht(500), reserved: baht(800), days: 5 }));
    expect(r).toMatchObject({ kind: "shortfall", shortfall: baht(300), daysLeft: 5 });
  });

  it("savings count toward a shortfall: they are set aside, not spendable", () => {
    const r = computeBudget(input({ balance: baht(500), savings: baht(600), days: 5 }));
    expect(r).toMatchObject({ kind: "shortfall", shortfall: baht(100) });
  });

  it("floors to whole baht: 1,000 over 3 days is 333", () => {
    const r = computeBudget(input({ balance: baht(1000), days: 3 }));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(333) });
  });

  it("floors, never rounds up: 2,000 over 3 days is 666 (not 667)", () => {
    const r = computeBudget(input({ balance: baht(2000), days: 3 }));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(666) });
  });

  it("overspending today gives a negative todayRemaining", () => {
    const r = computeBudget(input({ balance: baht(850), days: 10, spentToday: baht(150) }));
    expect(r).toMatchObject({ kind: "ok", dailyBudget: baht(100), todayRemaining: baht(-50) });
  });

  it("card 14: essentials not set — the daily figure shows, but spare and purchase limit are unknown (ask first)", () => {
    const r = computeBudget(input({ balance: baht(750), days: 10 }));
    expect(r).toEqual({
      kind: "ok",
      usable: baht(750),
      dailyBudget: baht(75),
      todayRemaining: baht(75),
      daysLeft: 10,
      spare: null,
      maxPurchase: null,
      essentialShortPerDay: null,
    });
  });

  it("card 14: essentials not set — trying a purchase cannot say what is left either", () => {
    expect(simulatePurchase(input({ balance: baht(750), days: 10 }), baht(600))).toMatchObject({
      kind: "ok",
      dailyBudget: baht(15),
      maxPurchase: null,
      essentialShortPerDay: null,
    });
  });

  it("essentials set to 0 on purpose: all usable money is spare", () => {
    const r = computeBudget(input({ balance: baht(1000), days: 10, essentialPerDay: 0 }));
    expect(r).toMatchObject({ kind: "ok", spare: baht(1000), maxPurchase: baht(1000), essentialShortPerDay: 0 });
  });
});

describe("tryOut — card 14 (try before paying; nothing is saved)", () => {
  // Central example: 1,000 · 10 days · essentials 70 a day · equipment 250 + activity 200 held
  const central = (over: Partial<BudgetInput> = {}) =>
    input({ balance: baht(1000), reserved: baht(450), essentialPerDay: baht(70), ...over });

  it("W12: shoes 480 → 80 a day, within the 600 limit", () => {
    const r = tryOut(figma(), { buy: baht(480), release: 0 });
    expect(r).toMatchObject({ verdict: "ok", needs: [], overLimitBy: 0 });
    expect(r.before).toMatchObject({ dailyBudget: baht(120), maxPurchase: baht(600) });
    expect(r.after).toMatchObject({ dailyBudget: baht(80), essentialShortPerDay: 0 });
  });

  it("W14: headphones 700 → over the limit by 100, 61 a day, essentials short 9 a day", () => {
    const r = tryOut(figma(), { buy: baht(700), release: 0 });
    expect(r).toMatchObject({ verdict: "essentials_short", overLimitBy: baht(100) });
    expect(r.after).toMatchObject({ dailyBudget: baht(61), essentialShortPerDay: baht(9) });
  });

  it("14: doing every plan leaves the central example 150 short", () => {
    const r = tryOut(central(), { buy: 0, release: 0 });
    expect(r).toMatchObject({ verdict: "essentials_short", overLimitBy: baht(150) });
  });

  it("14: trying to postpone activity 200 leaves 50 spare", () => {
    const r = tryOut(central(), { buy: 0, release: baht(200) });
    expect(r.verdict).toBe("ok");
    expect(r.after).toMatchObject({ spare: baht(50) });
  });

  it("14: income still to come is not money today — 1,200 on 1,000 is short 200", () => {
    const r = tryOut(central({ reserved: 0 }), { buy: baht(1200), release: 0 });
    expect(r.verdict).toBe("shortfall");
    expect(r.after).toMatchObject({ kind: "shortfall", shortfall: baht(200) });
    expect(r.overLimitBy).toBeNull();
  });

  it("14: the daily average is not the purchase limit — 100 a day, but 300 is the most for one item", () => {
    const r = tryOut(central({ reserved: 0 }), { buy: 0, release: 0 });
    expect(r.before).toMatchObject({ dailyBudget: baht(100), maxPurchase: baht(300) });
    expect(tryOut(central({ reserved: 0 }), { buy: baht(301), release: 0 }).verdict).toBe("essentials_short");
  });

  it("14: essentials unknown → ask first, no numbers", () => {
    const r = tryOut(central({ essentialPerDay: null }), { buy: baht(100), release: 0 });
    expect(r).toEqual({ verdict: "ask", needs: ["essentials"], before: null, after: null, overLimitBy: null });
  });

  it("03: payday today → ask whether the money came, never divide by zero", () => {
    const r = tryOut(central({ payday: TODAY }), { buy: baht(100), release: 0 });
    expect(r).toMatchObject({ verdict: "ask", needs: ["payday"], before: null });
  });

  it("19: a new buffer counts only after — using the 120 buffer takes 120 a day to 130", () => {
    const r = tryOut(figma(), { buy: 0, release: 0, emergencyBuffer: 0 });
    expect(r.before).toMatchObject({ dailyBudget: baht(120) });
    expect(r.after).toMatchObject({ dailyBudget: baht(130) });
  });

  it("does not change the input it was given", () => {
    const i = central();
    const copy = { ...i };
    tryOut(i, { buy: baht(300), release: baht(200) });
    expect(i).toEqual(copy);
  });
});
