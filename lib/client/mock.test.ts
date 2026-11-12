import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { createMockApi } from "./mock";

const food = { amount: 4500, category: "food" as const, note: "ข้าว" };

async function expectApiError(p: Promise<unknown>, status: number, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status, code });
}

describe("mock default scenario (Figma reference numbers)", () => {
  it("starts day 1 of a 12 day cycle", async () => {
    const s = await createMockApi().summary();
    expect(s).toMatchObject({
      today: "2026-11-11",
      payday: "2026-11-23",
      balance: 240000,
      savings: 24000,
      emergencyBuffer: 12000,
      reserved: 60000,
      essentialPerDay: 7000,
      spentToday: 0,
    });
    expect(s.budget).toMatchObject({ kind: "ok", dailyBudget: 12000, maxPurchase: 60000, daysLeft: 12 });
  });

  it("addEntry lowers todayRemaining and balance; the same key is one spend", async () => {
    const api = createMockApi();
    const first = await api.addEntry(food, "k1");
    expect(first.summary.spentToday).toBe(4500);
    expect(first.summary.balance).toBe(235500);
    expect(first.summary.budget).toMatchObject({ kind: "ok", todayRemaining: 7500 });
    const again = await api.addEntry(food, "k1");
    expect(again.entry.id).toBe(first.entry.id);
    expect(again.summary.balance).toBe(235500);
    expect((await api.entries()).entries).toHaveLength(1);
  });

  it("simulate: 480 baht leaves 80 a day; 700 baht is 100 over the limit", async () => {
    const api = createMockApi();
    const ok = await api.simulate({ amount: 48000 });
    expect(ok.verdict).toBe("ok");
    expect(ok.after).toMatchObject({ kind: "ok", dailyBudget: 8000 });
    const over = await api.simulate({ amount: 70000 });
    expect(over.verdict).toBe("essentials_short");
    expect(over.overLimitBy).toBe(10000);
  });

  it("separateBills frees the held money", async () => {
    // (2,400 − 200 − 240 − 120) ÷ 12 = 153.333… → 153.25 (25-satang step)
    const api = createMockApi({ separateBills: ["ค่าหอ"] });
    const s = await api.summary();
    expect(s.reserved).toBe(20000);
    expect(s.budget).toMatchObject({ kind: "ok", dailyBudget: 15325 });
  });

  it("addPlan raises reserved when held this cycle, not when due after payday", async () => {
    const api = createMockApi();
    const held = await api.addPlan({ title: "รองเท้า", amount: 30000 }, "p1");
    expect(held.summary.reserved).toBe(90000);
    expect(held.plan.heldThisCycle).toBe(true);
    const next = await api.addPlan({ title: "ของรอบหน้า", amount: 1000, dueOn: "2026-12-01" }, "p2");
    expect(next.summary.reserved).toBe(90000);
    const again = await api.addPlan({ title: "รองเท้า", amount: 30000 }, "p1");
    expect(again.plan.id).toBe(held.plan.id);
    expect(again.summary.reserved).toBe(90000);
  });
});

describe("mock scenarios", () => {
  it("fresh: no cycle until createCycle", async () => {
    const api = createMockApi({ scenario: "fresh", consented: true });
    expect((await api.me()).hasActiveCycle).toBe(false);
    await expectApiError(api.summary(), 409, "no_cycle");
    const { summary } = await api.createCycle({
      incomeSource: "family",
      incomeFrequency: "monthly",
      payday: "2026-11-23",
      balance: 240000,
      savingsAmount: 24000,
      emergencyBuffer: 12000,
      bills: [{ title: "ค่าหอ", amount: 40000 }],
      essentials: { food: 5000, transport: 2000 },
    });
    // (2,400 − 240 − 120 − 400) ÷ 12 = 136.666… → 136.50 (25-satang step)
    expect(summary.budget).toMatchObject({ kind: "ok", dailyBudget: 13650 });
    expect((await api.me()).hasActiveCycle).toBe(true);
  });

  it("midCycle: day 5 with earlier spending", async () => {
    const s = await createMockApi({ scenario: "midCycle" }).summary();
    expect(s.today).toBe("2026-11-15");
    expect(s.budget.kind).toBe("ok");
    expect(s.spentToday).toBe(4500);
  });

  it("shortfall", async () => {
    expect((await createMockApi({ scenario: "shortfall" }).summary()).budget.kind).toBe("shortfall");
  });

  it("tight: ok but under 50 baht a day", async () => {
    const { budget } = await createMockApi({ scenario: "tight" }).summary();
    expect(budget.kind).toBe("ok");
    if (budget.kind === "ok") expect(budget.dailyBudget).toBeLessThan(5000);
  });

  it("paydayPassed", async () => {
    expect((await createMockApi({ scenario: "paydayPassed" }).summary()).budget.kind).toBe("payday-passed");
  });
});

describe("mock entries and plans", () => {
  it("edit and cancel an entry", async () => {
    const api = createMockApi();
    const { entry } = await api.addEntry(food, "k");
    const edited = await api.editEntry(entry.id, { amount: 1000 });
    expect(edited.entry.amount).toBe(1000);
    expect(edited.summary.spentToday).toBe(1000);
    const cancelled = await api.cancelEntry(entry.id);
    expect(cancelled.summary.spentToday).toBe(0);
    expect(cancelled.summary.balance).toBe(240000);
    expect((await api.entries()).entries).toHaveLength(0);
    await expectApiError(api.editEntry(entry.id, { amount: 5 }), 409, "entry_cancelled");
    await expectApiError(api.cancelEntry("nope"), 404, "not_found");
  });

  it("pay / unpay a bill moves money between reserved and balance, not into today", async () => {
    const api = createMockApi();
    const bill = (await api.plans()).plans.find((p) => p.title === "ค่าน้ำ")!;
    const paid = await api.planAction(bill.id, "pay");
    expect(paid.plan.status).toBe("paid");
    expect(paid.summary).toMatchObject({ reserved: 55000, balance: 235000, spentToday: 0 });
    expect((await api.planAction(bill.id, "pay")).summary.balance).toBe(235000);
    await expectApiError(api.planAction(bill.id, "cancel"), 409, "plan_status");
    const undone = await api.planAction(bill.id, "unpay");
    expect(undone.summary).toMatchObject({ reserved: 60000, balance: 240000 });
  });

  it("postpone, keep and cancel release or hold money", async () => {
    const api = createMockApi();
    const bill = (await api.plans()).plans.find((p) => p.title === "ค่าไฟ")!;
    expect((await api.planAction(bill.id, "postpone")).summary.reserved).toBe(45000);
    expect((await api.planAction(bill.id, "keep")).summary.reserved).toBe(60000);
    expect((await api.planAction(bill.id, "cancel")).summary.reserved).toBe(45000);
  });

  it("simulate can try postponing a held plan", async () => {
    const api = createMockApi();
    const bill = (await api.plans()).plans.find((p) => p.title === "ค่าหอ")!;
    const r = await api.simulate({ postponePlanIds: [bill.id] });
    expect(r.after).toMatchObject({ kind: "ok", dailyBudget: 15325 });
    await expectApiError(api.simulate({ postponePlanIds: ["nope"] }), 422, "invalid_input");
  });

  it("adjustBalance and setEssentials change the summary", async () => {
    const api = createMockApi();
    expect((await api.adjustBalance({ balance: 300000 })).summary.balance).toBe(300000);
    expect((await api.setEssentials({ food: 4000, transport: 1000 })).summary.essentialPerDay).toBe(5000);
  });
});

describe("mock consent", () => {
  it("blocks every financial call until accepted; me still works", async () => {
    const api = createMockApi({ consented: false });
    expect(await api.consent()).toEqual({ accepted: false, version: null });
    expect((await api.me()).hasActiveCycle).toBe(true);
    const calls: Promise<unknown>[] = [
      api.summary(),
      api.entries(),
      api.addEntry(food, "k"),
      api.simulate({ amount: 100 }),
      api.plans(),
      api.addPlan({ title: "x", amount: 1 }, "k"),
      api.planAction("x", "pay"),
      api.createCycle({ incomeSource: "family", incomeFrequency: "monthly", payday: "2026-11-23", balance: 1 }),
      api.adjustBalance({ balance: 1 }),
      api.setEssentials({ food: 1, transport: 1 }),
      api.editEntry("x", {}),
      api.cancelEntry("x"),
    ];
    for (const c of calls) await expectApiError(c, 403, "no_consent");
    await api.acceptConsent("2026-11-11");
    expect(await api.consent()).toEqual({ accepted: true, version: "2026-11-11" });
    expect((await api.summary()).balance).toBe(240000);
  });

  it("fresh scenario defaults to not consented", async () => {
    expect((await createMockApi({ scenario: "fresh" }).consent()).accepted).toBe(false);
  });
});

describe("mock points and rewards", () => {
  it("claims once per day", async () => {
    const api = createMockApi();
    expect(await api.points()).toEqual({ balance: 11, claimedToday: false });
    expect(await api.claimPoints("a")).toEqual({ balance: 12, claimedToday: true });
    expect(await api.claimPoints("b")).toEqual({ balance: 12, claimedToday: true });
    expect((await api.points()).claimedToday).toBe(true);
  });

  it("redeems a reward: deducts points and stock, idempotent, then not enough points", async () => {
    const api = createMockApi();
    const [r] = await api.rewards();
    expect(r).toMatchObject({ name: "สติกเกอร์พอใช้", cost: 10, stock: 5 });
    const first = await api.redeemReward(r.id, "k1");
    expect(first.balance).toBe(1);
    expect(await api.redeemReward(r.id, "k1")).toEqual(first);
    expect((await api.rewards())[0].stock).toBe(4);
    await expectApiError(api.redeemReward(r.id, "k2"), 409, "not_enough_points");
    await expectApiError(api.redeemReward("nope", "k3"), 404, "not_found");
  });
});

describe("mock promos", () => {
  it("lists the two fixtures with budget fit from today's daily budget", async () => {
    const [moo, tea] = await createMockApi().promos();
    expect(moo).toMatchObject({ shop: "หมูกระทะลุงชัย", price: 12900, sponsored: true, fitsBudget: false, leftAfter: -900 });
    expect(tea).toMatchObject({ shop: "ชานมหน้ามอ", price: 3500, fitsBudget: true, leftAfter: 8500 });
  });

  it("fitsBudget is false when over, null when the budget is not ok", async () => {
    const [moo] = await createMockApi({ scenario: "tight" }).promos();
    expect(moo).toMatchObject({ fitsBudget: false, leftAfter: 4000 - 12900 });
    const [none] = await createMockApi({ scenario: "shortfall" }).promos();
    expect(none).toMatchObject({ fitsBudget: null, leftAfter: null });
  });

  it("claim code is stable; shopRedeem redeems once", async () => {
    const api = createMockApi();
    const { code } = await api.claimPromo("promo-chanom");
    expect(code).toMatch(/^PC-[A-Z0-9]{4}$/);
    expect((await api.claimPromo("promo-chanom")).code).toBe(code);
    expect(await api.shopRedeem(code)).toEqual({ status: "redeemed", promoTitle: "ชานมไข่มุก แก้วใหญ่" });
    expect((await api.shopRedeem(code)).status).toBe("already_redeemed");
    expect((await api.shopRedeem("PC-ZZZZ")).status).toBe("invalid");
    await expectApiError(api.promo("nope"), 404, "not_found");
  });
});

describe("mock shopRedeem needs no student consent", () => {
  it("answers invalid instead of throwing no_consent for a shop owner", async () => {
    const api = createMockApi({ scenario: "fresh" });
    expect(await api.shopRedeem("PC-ZZZZ")).toEqual({ status: "invalid" });
  });
});

describe("mock T1b surface (income, aggregates, quota, reminders, delete)", () => {
  it("addIncome raises balance once per key; rejects 0, negative and future dates", async () => {
    const api = createMockApi();
    const first = await api.addIncome({ amount: 50000, note: "ค่าขนม" }, "i1");
    expect(first.summary.balance).toBe(290000);
    const again = await api.addIncome({ amount: 50000, note: "ค่าขนม" }, "i1");
    expect(again.summary.balance).toBe(290000);
    expect((await api.summary()).balance).toBe(290000);
    await expectApiError(api.addIncome({ amount: 0 }, "i2"), 422, "invalid_input");
    await expectApiError(api.addIncome({ amount: -5 }, "i3"), 422, "invalid_input");
    await expectApiError(api.addIncome({ amount: 100, receivedOn: "2026-11-12" }, "i4"), 422, "invalid_input");
    expect((await api.summary()).balance).toBe(290000);
  });

  it("categoryTotals and dailySpend agree with the entries added", async () => {
    const api = createMockApi();
    await api.addEntry(food, "a");
    await api.addEntry({ amount: 3000, category: "food" }, "b");
    await api.addEntry({ amount: 9000, category: "transport" }, "c");
    expect((await api.categoryTotals()).items).toEqual([
      { category: "transport", amount: 9000, count: 1 },
      { category: "food", amount: 7500, count: 2 },
    ]);
    const { days } = await api.dailySpend();
    expect(days).toHaveLength(12);
    expect(days[0]).toEqual({ date: "2026-11-11", spent: 16500 + 0, over: true });
    expect(days[1]).toEqual({ date: "2026-11-12", spent: null, over: false });
    expect(days.filter((d) => d.spent === null)).toHaveLength(11);
  });

  it("allows keeping unlimited purchase plans without hitting any quota limit", async () => {
    const api = createMockApi();
    for (let i = 0; i < 5; i++) await api.addPlan({ title: `p${i}`, amount: 1000 }, `k${i}`);
    const { plans } = await api.plans();
    expect(plans.filter((p) => p.kind === "purchase" && p.status === "reserved")).toHaveLength(5);
    // retrying an accepted key is still fine
    await api.addPlan({ title: "p0", amount: 1000 }, "k0");
  });

  it("reminderSettings round-trip; invalid time rejected; habits stay empty", async () => {
    const api = createMockApi();
    expect(await api.reminderSettings()).toEqual({ enabled: false, time: "12:30", pausedUntil: null, habits: [] });
    const saved = await api.saveReminderSettings({ enabled: true, time: "08:05", pausedUntil: "2026-12-01" });
    expect(saved).toEqual({ enabled: true, time: "08:05", pausedUntil: "2026-12-01", habits: [] });
    expect(await api.reminderSettings()).toEqual(saved);
    await expectApiError(api.saveReminderSettings({ enabled: true, time: "25:00", pausedUntil: null }), 422, "invalid_input");
    await expectApiError(api.saveReminderSettings({ enabled: true, time: "8:5", pausedUntil: null }), 422, "invalid_input");
    expect(await api.reminderSettings()).toEqual(saved);
  });

  it("deleteMyData returns the instance to fresh and not consented", async () => {
    const api = createMockApi();
    await api.addEntry(food, "a");
    await api.deleteMyData();
    expect((await api.consent()).accepted).toBe(false);
    await expectApiError(api.summary(), 403, "no_consent");
    await api.acceptConsent("v");
    expect(await api.me()).toEqual({ hasActiveCycle: false });
    await expectApiError(api.summary(), 409, "no_cycle");
  });

  it("promos expose overBy: 0 when it fits, positive when over, null without a budget", async () => {
    const [over, fits] = await createMockApi().promos();
    expect(over.overBy).toBe(900);
    expect(fits.overBy).toBe(0);
    const [moo] = await createMockApi({ scenario: "tight" }).promos();
    expect(moo.overBy).toBe(12900 - 4000);
    const [none] = await createMockApi({ scenario: "shortfall" }).promos();
    expect(none.overBy).toBeNull();
  });

  it("not consented: new financial methods throw 403 no_consent", async () => {
    const api = createMockApi({ consented: false });
    await expectApiError(api.addIncome({ amount: 100 }, "k"), 403, "no_consent");
    await expectApiError(api.dailySpend(), 403, "no_consent");
    await expectApiError(api.categoryTotals(), 403, "no_consent");
    await expectApiError(api.reminderSettings(), 403, "no_consent");
    await expectApiError(api.saveReminderSettings({ enabled: false, time: "12:30", pausedUntil: null }), 403, "no_consent");
    await expectApiError(api.deleteMyData(), 403, "no_consent");
  });
});

describe("mock card 23 (payday / basis / stale)", () => {
  it("simulate({payday}) uses computeBudget: more days, same money, basis of the stored numbers", async () => {
    const api = createMockApi();
    const s = await api.summary();
    const sim = await api.simulate({ payday: "2026-11-26" });
    expect(sim.basis).toBe(s.basis);
    expect(sim.before).toEqual(s.budget);
    expect(sim.after).toMatchObject({ kind: "ok", daysLeft: 15 });
    expect(sim.verdict).not.toBe("ask");
    // nothing saved
    expect((await api.summary()).payday).toBe("2026-11-23");
  });

  it("simulate({payday}) must be after today; simulate({balance}) changes only after", async () => {
    const api = createMockApi();
    await expectApiError(api.simulate({ payday: "2026-11-11" }), 422, "invalid_input");
    const sim = await api.simulate({ balance: 300000 });
    expect(sim.before).toEqual((await api.summary()).budget);
    expect(sim.after).not.toEqual(sim.before);
  });

  it("changePayday requires basis, moves the payday and then summary.budget equals the simulate's after", async () => {
    const api = createMockApi();
    const sim = await api.simulate({ payday: "2026-11-26" });
    await expectApiError(api.changePayday({ payday: "2026-11-26", basis: "" }), 422, "invalid_input");
    const res = await api.changePayday({ payday: "2026-11-26", basis: sim.basis });
    expect(res.summary.payday).toBe("2026-11-26");
    expect(res.summary.budget).toEqual(sim.after);
    expect(res.summary.balance).toBe(240000);
  });

  it("same payday again returns the same result (double tap)", async () => {
    const api = createMockApi();
    const sim = await api.simulate({ payday: "2026-11-26" });
    const a = await api.changePayday({ payday: "2026-11-26", basis: sim.basis });
    const b = await api.changePayday({ payday: "2026-11-26", basis: sim.basis });
    expect(b.summary).toEqual(a.summary);
  });

  it("payday must be after the mock's today", async () => {
    const api = createMockApi();
    const { basis } = await api.summary();
    await expectApiError(api.changePayday({ payday: "2026-11-11", basis }), 422, "invalid_input");
  });

  it("a new entry changes the basis: the old basis is stale (409) for payday, balance and plan", async () => {
    const api = createMockApi();
    const old = (await api.simulate({ payday: "2026-11-26" })).basis;
    await api.addEntry(food, "k1");
    const fresh = await api.summary();
    expect(fresh.basis).not.toBe(old);
    await expectApiError(api.changePayday({ payday: "2026-11-26", basis: old }), 409, "stale");
    await expectApiError(api.adjustBalance({ balance: 100000, basis: old }), 409, "stale");
    await expectApiError(api.addPlan({ title: "x", amount: 100, basis: old }, "kp"), 409, "stale");
    // nothing changed by the refused calls
    expect((await api.summary()).payday).toBe("2026-11-23");
    // the new basis works
    const ok = await api.changePayday({ payday: "2026-11-26", basis: fresh.basis });
    expect(ok.summary.payday).toBe("2026-11-26");
  });

  it("basis also changes with a new plan, a balance adjustment and a moved payday", async () => {
    const api = createMockApi();
    const b0 = (await api.summary()).basis;
    await api.addPlan({ title: "x", amount: 1000 }, "p1");
    const b1 = (await api.summary()).basis;
    await api.adjustBalance({ balance: 200000 });
    const b2 = (await api.summary()).basis;
    await api.changePayday({ payday: "2026-11-26", basis: b2 });
    const b3 = (await api.summary()).basis;
    expect(new Set([b0, b1, b2, b3]).size).toBe(4);
  });

  it("adjustBalance / addPlan without basis still work; with the current basis they work too", async () => {
    const api = createMockApi();
    await api.adjustBalance({ balance: 200000 });
    const { basis } = await api.summary();
    await api.adjustBalance({ balance: 210000, basis });
    const { basis: b2 } = await api.summary();
    const r = await api.addPlan({ title: "x", amount: 1000, basis: b2 }, "p9");
    expect(r.plan.title).toBe("x");
  });
});
