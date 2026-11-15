import { describe, expect, it } from "vitest";
import { computeBudget, simulatePurchase, type BudgetInput } from "./budget";
import { addDays } from "./time";

// Deterministic generated cases: reproducible without another test dependency or provider calls.
describe("financial invariants over 5,000 generated cases", () => {
  it("preserves nonmutation, quarter-baht rounding, conservation and purchase monotonicity", () => {
    let seed = 0x504f5243;
    const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    for (let n = 0; n < 5000; n++) {
      const days = random(370) - 2;
      const input: BudgetInput = {
        balance: random(100_000_000), spentToday: random(100_000), reserved: random(10_000_000),
        savings: random(10_000_000), emergencyBuffer: random(10_000_000),
        essentialPerDay: n % 5 === 0 ? null : random(100_000),
        today: "2026-11-14", payday: addDays("2026-11-14", days),
      };
      const before = { ...input };
      const base = computeBudget(input);
      const bought = simulatePurchase(input, random(10_000_000));
      expect(input).toEqual(before);
      if (base.kind === "ok") {
        expect(base.dailyBudget % 25).toBe(0);
        expect(base.todayRemaining + input.spentToday).toBe(base.dailyBudget);
        expect(base.dailyBudget * base.daysLeft).toBeLessThanOrEqual(base.usable + input.spentToday);
        expect(base.spare === null).toBe(input.essentialPerDay === null);
        if (bought.kind === "ok") expect(bought.dailyBudget).toBeLessThanOrEqual(base.dailyBudget);
      } else if (base.kind === "shortfall") {
        expect(base.shortfall).toBe(-base.usable);
        expect(bought.kind).toBe("shortfall");
      } else {
        expect(days).toBeLessThanOrEqual(0);
        expect(bought.kind).toBe("payday-passed");
      }
    }
  });
});
