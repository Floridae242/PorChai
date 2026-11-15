import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "./client";
import { createCycle } from "./cycle";
import { loadSummary } from "./budget";
import { addInstallments } from "./installments";
import { listPlans, actOnPlan } from "./plans";
import { parseNewCycle } from "@/lib/validate";
import { addDays, thaiDate } from "@/lib/calc/time";
import {
  installmentSchedule,
  type InstallmentInput,
} from "@/lib/chat/actions/installments";

const db = getDb(),
  users: string[] = [];
const today = () => thaiDate(new Date());
async function user(cycle = true) {
  const row = await db
    .from("users")
    .insert({ line_user_id: `U_installment_${crypto.randomUUID()}` })
    .select("id")
    .single();
  if (row.error) throw row.error;
  const id = row.data.id as string;
  users.push(id);
  if (cycle)
    await createCycle(
      id,
      parseNewCycle(
        {
          incomeSource: "family",
          incomeFrequency: "monthly",
          balance: 500000,
          payday: addDays(today(), 12),
          essentials: { food: 5000, transport: 2000 },
        },
        today(),
        new Date(),
      ),
      today(),
    );
  return id;
}
const input = (): InstallmentInput => ({
  title: "โทรศัพท์",
  total: 100001,
  count: 3,
  firstDue: today(),
});
async function call(id: string, value = input(), key = crypto.randomUUID()) {
  const summary = await loadSummary(id);
  await addInstallments(id, value, key, summary.basis);
  return key;
}
afterEach(async () => {
  if (users.length)
    expect(
      (await db.from("users").delete().in("id", users.splice(0))).error,
    ).toBeNull();
});
describe("atomic installment bills in real local PostgreSQL", () => {
  it("creates exact bill rows with no expense; only due installments reserve this cycle", async () => {
    const id = await user(),
      value = input();
    await call(id, value);
    const plans = await listPlans(id);
    expect(
      plans.map((p) => ({ title: p.title, amount: p.amount, dueOn: p.dueOn })),
    ).toEqual(installmentSchedule(value, today()));
    expect(
      plans.every((p) => p.kind === "bill" && p.status === "reserved"),
    ).toBe(true);
    expect(
      (await db.from("entries").select("id").eq("user_id", id)).data,
    ).toEqual([]);
    expect((await loadSummary(id)).reserved).toBe(33334);
  });
  it("repeated and simultaneous requests create one schedule", async () => {
    const id = await user(),
      value = input(),
      key = crypto.randomUUID(),
      basis = (await loadSummary(id)).basis;
    await Promise.all(
      Array.from({ length: 6 }, () => addInstallments(id, value, key, basis)),
    );
    await addInstallments(id, value, key, basis);
    expect(await listPlans(id)).toHaveLength(3);
  });
  it("a committed schedule can be retried on the next day without creating or rejecting it", async () => {
    const id = await user(),
      value = input(),
      key = await call(id, value);
    const tomorrow = new Date(Date.now() + 86400000);
    await expect(
      addInstallments(id, value, key, "old-basis", tomorrow),
    ).resolves.toBeUndefined();
    expect(await listPlans(id)).toHaveLength(3);
  });
  it.each([
    { total: 200000 },
    { count: 2 },
    { count: 4 },
    { title: "สินค้าอื่น" },
    { firstDue: "2080-01-01" },
  ])("rejects idempotency reuse with different input %j", async (patch) => {
    const id = await user(),
      value = input(),
      key = await call(id, value);
    await expect(
      addInstallments(
        id,
        { ...value, ...patch },
        key,
        (await loadSummary(id)).basis,
      ),
    ).rejects.toMatchObject({ code: "stale" });
    expect(await listPlans(id)).toHaveLength(3);
  });
  it("same key in another account creates only that account's own schedule", async () => {
    const a = await user(),
      b = await user(),
      key = "shared-key";
    await call(a, input(), key);
    await call(b, input(), key);
    expect(await listPlans(a)).toHaveLength(3);
    expect(await listPlans(b)).toHaveLength(3);
  });
  it("a paid installment counts once and unpay restores the held bill", async () => {
    const id = await user();
    await call(id);
    const first = (await listPlans(id))[0];
    await actOnPlan(id, first.id, "pay", null, today());
    await actOnPlan(id, first.id, "pay", null, today());
    expect(
      (
        await db
          .from("entries")
          .select("amount")
          .eq("user_id", id)
          .is("cancelled_at", null)
      ).data,
    ).toEqual([{ amount: 33334 }]);
    expect((await loadSummary(id)).reserved).toBe(0);
    await actOnPlan(id, first.id, "unpay", null, today());
    expect((await loadSummary(id)).reserved).toBe(33334);
  });
  it("unpaid future installments move to the next cycle, paid installments do not", async () => {
    const id = await user();
    await call(id);
    const before = await listPlans(id);
    await actOnPlan(id, before[0].id, "pay", null, today());
    const nextDay = addDays(today(), 12);
    await createCycle(
      id,
      parseNewCycle(
        {
          incomeSource: "family",
          incomeFrequency: "monthly",
          balance: 300000,
          payday: addDays(nextDay, 30),
        },
        nextDay,
        new Date(),
      ),
      nextDay,
    );
    expect((await listPlans(id)).map((p) => p.id)).toEqual(
      before.slice(1).map((p) => p.id),
    );
  });
  it("does not mutate when budget basis is stale", async () => {
    const id = await user(),
      basis = (await loadSummary(id)).basis;
    await call(id);
    await expect(
      addInstallments(id, input(), crypto.randomUUID(), basis),
    ).rejects.toMatchObject({ code: "stale" });
    expect(await listPlans(id)).toHaveLength(3);
  });
  it("rejects a cycle belonging to another account", async () => {
    const a = await user(),
      b = await user();
    const cycle = await db
      .from("cycles")
      .select("id")
      .eq("user_id", b)
      .single();
    const r = await db.rpc("add_installments", {
      p_user: a,
      p_cycle: cycle.data!.id,
      p_title: "x",
      p_total: 1000,
      p_count: 3,
      p_first: today(),
      p_key: "bad-owner",
    });
    expect(r.error?.code).toBe("IN409");
    expect(await listPlans(a)).toEqual([]);
    expect(await listPlans(b)).toEqual([]);
  });
  it.each([0, -1, 61])(
    "invalid batch count %s creates zero rows even bypassing TypeScript",
    async (count) => {
      const id = await user(),
        cycle = await db.from("cycles").select("id").eq("user_id", id).single();
      const r = await db.rpc("add_installments", {
        p_user: id,
        p_cycle: cycle.data!.id,
        p_title: "x",
        p_total: 1000,
        p_count: count,
        p_first: today(),
        p_key: "invalid",
      });
      expect(r.error?.code).toBe("IN422");
      expect(await listPlans(id)).toEqual([]);
    },
  );
  it("rejects a partial idempotency group without adding the missing rows", async () => {
    const id = await user(),
      cycle = await db.from("cycles").select("id").eq("user_id", id).single();
    expect(
      (
        await db
          .from("plans")
          .insert({
            user_id: id,
            cycle_id: cycle.data!.id,
            kind: "bill",
            title: "existing",
            amount: 100,
            due_on: today(),
            status: "reserved",
            idempotency_key: "installment:partial:2",
          })
      ).error,
    ).toBeNull();
    await expect(call(id, input(), "partial")).rejects.toMatchObject({
      code: "invalid_installment",
    });
    expect(await listPlans(id)).toHaveLength(1);
  });
  it("a missing cycle cannot create an installment agreement", async () => {
    const id = await user(false);
    await expect(
      addInstallments(id, input(), "no-cycle", "basis"),
    ).rejects.toMatchObject({ code: "no_cycle" });
  });
});
