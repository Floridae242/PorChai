import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getDb } from "./client";
import { createCycle } from "./cycle";
import { parseNewCycle } from "@/lib/validate";
import { addDays, thaiDate } from "@/lib/calc/time";
import { addEntry, cancelEntry, editEntry } from "./entries";
import { addIncome } from "./income";
import { pointsState, claimDailyPoints } from "./rewards";
import {
  spendingCategories,
  saveSpendingCategory,
} from "./spending-categories";
import { spendingInsights } from "./spending-insights";
import { addPlan, actOnPlan } from "./plans";
import { parseNewPlan } from "@/lib/validate";
const db = getDb(),
  users: string[] = [],
  today = () => thaiDate(new Date());
async function user() {
  const r = await db
    .from("users")
    .insert({ line_user_id: `U_personal_${crypto.randomUUID()}` })
    .select("id")
    .single();
  if (r.error) throw r.error;
  const id = r.data.id as string;
  users.push(id);
  await createCycle(
    id,
    parseNewCycle(
      {
        incomeSource: "family",
        incomeFrequency: "monthly",
        balance: 500000,
        payday: addDays(today(), 12),
      },
      today(),
      new Date(),
    ),
    today(),
  );
  // Entries here go back up to a month: the cycle began before them (entries before a cycle are refused, 16 Nov)
  const began = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const moved = await db.from("cycles").update({ started_at: began }).eq("user_id", id);
  if (moved.error) throw moved.error;
  return id;
}
const record = (
  id: string,
  key = crypto.randomUUID(),
  day = today(),
  categoryId?: string,
) =>
  addEntry(
    id,
    {
      amount: 5000,
      category: "food",
      note: "ชานม",
      spentOn: day,
      ...(categoryId ? { categoryId } : {}),
    },
    key,
    "form",
  );
afterEach(async () => {
  if (users.length)
    expect(
      (await db.from("users").delete().in("id", users.splice(0))).error,
    ).toBeNull();
});
describe("daily automatic points and personalized expense categories", () => {
  it("concurrent budget edits from one version have exactly one winner", async () => {
    const u = await user(),
      c = await saveSpendingCategory(u, {
        label: "ชานม",
        parent: "food",
        monthlyBudget: null,
      });
    const changes = await Promise.allSettled(
      [10000, 20000, 30000].map((monthlyBudget) =>
        saveSpendingCategory(u, { ...c, monthlyBudget }),
      ),
    );
    expect(changes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      changes
        .filter((x) => x.status === "rejected")
        .map((x) => (x as PromiseRejectedResult).reason.code),
    ).toEqual(["stale", "stale"]);
    const winner = changes.find(
      (
        x,
      ): x is PromiseFulfilledResult<
        Awaited<ReturnType<typeof saveSpendingCategory>>
      > => x.status === "fulfilled",
    )!;
    expect(
      (await spendingCategories(u)).find((x) => x.id === c.id)?.monthlyBudget,
    ).toBe(winner.value.monthlyBudget);
  });
  it("concurrent identical category names cannot create duplicates", async () => {
    const u = await user(),
      value = { label: "ชานม", parent: "food", monthlyBudget: null };
    const results = await Promise.allSettled([
      saveSpendingCategory(u, value),
      saveSpendingCategory(u, value),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(
      (await spendingCategories(u)).filter((x) => x.label === "ชานม"),
    ).toHaveLength(1);
  });
  it("the 100-category limit remains exact under simultaneous creates", async () => {
    const u = await user();
    expect(
      (
        await db
          .from("spending_categories")
          .insert(
            Array.from({ length: 94 }, (_, i) => ({
              user_id: u,
              id: crypto.randomUUID(),
              label: `cap-${i}`,
              parent: "food",
            })),
          )
      ).error,
    ).toBeNull();
    const results = await Promise.allSettled(
      ["last-a", "last-b"].map((label) =>
        saveSpendingCategory(u, { label, parent: "food", monthlyBudget: null }),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    const count = await db
      .from("spending_categories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", u);
    expect(count.error).toBeNull();
    expect(count.count).toBe(100);
    const base = (await spendingCategories(u)).find((x) => x.id === "food")!;
    expect(
      (await saveSpendingCategory(u, { ...base, monthlyBudget: 0 }))
        .monthlyBudget,
    ).toBe(0);
  });
  it("zero budget is tracked as exceeded while null budget remains unset", async () => {
    const u = await user(),
      base = (await spendingCategories(u)).find((c) => c.id === "food")!;
    await saveSpendingCategory(u, { ...base, monthlyBudget: 0 });
    await record(u);
    const insights = await spendingInsights(u);
    expect(insights.categories.find((c) => c.id === "food")).toMatchObject({
      monthlyBudget: 0,
      spent: 5000,
      remaining: -5000,
    });
    expect(insights.categories.find((c) => c.id === "transport")).toMatchObject(
      { monthlyBudget: null, remaining: null },
    );
    expect(insights.suggestions.some((c) => c.categoryId === "food")).toBe(
      false,
    );
  });
  it("previous-day points do not consume today's automatic daily award", async () => {
    const u = await user();
    expect(
      (await db.from("points_wallets").insert({ user_id: u, balance: 1 }))
        .error,
    ).toBeNull();
    expect(
      (
        await db
          .from("points_ledger")
          .insert({
            user_id: u,
            kind: "daily",
            delta: 1,
            earned_on: addDays(today(), -1),
            idempotency_key: "yesterday",
          })
      ).error,
    ).toBeNull();
    await record(u);
    expect((await pointsState(u)).balance).toBe(2);
    const days = await db
      .from("points_ledger")
      .select("earned_on")
      .eq("user_id", u)
      .eq("kind", "daily")
      .order("earned_on");
    expect(days.data).toEqual([
      { earned_on: addDays(today(), -1) },
      { earned_on: today() },
    ]);
  });
  it("paid bill spending appears once, unpay removes it from analysis without awarding again", async () => {
    const u = await user(),
      p = await addPlan(
        u,
        parseNewPlan({
          kind: "bill",
          title: "ค่าหอ",
          amount: 10000,
          dueOn: today(),
        }),
        "bill",
      );
    expect((await pointsState(u)).balance).toBe(0);
    await actOnPlan(u, p.plan.id, "pay", null, today());
    await actOnPlan(u, p.plan.id, "pay", null, today());
    let insights = await spendingInsights(u);
    expect(insights.total).toBe(10000);
    expect(insights.count).toBe(1);
    expect(insights.categories.find((c) => c.id === "bills")?.spent).toBe(
      10000,
    );
    await actOnPlan(u, p.plan.id, "unpay", null, today());
    insights = await spendingInsights(u);
    expect(insights.total).toBe(0);
    expect(insights.count).toBe(0);
    await actOnPlan(u, p.plan.id, "pay", null, today());
    expect((await spendingInsights(u)).total).toBe(10000);
    expect((await pointsState(u)).balance).toBe(1);
  });
  it("monthly budgets switch at Thai midnight while 30-day totals keep both days", async () => {
    const u = await user(),
      first = `${today().slice(0, 7)}-01`,
      previous = addDays(first, -1);
    await addEntry(
      u,
      { amount: 5000, category: "food", note: "ก่อนเที่ยงคืน", spentOn: previous },
      "before",
      "form",
    );
    await addEntry(
      u,
      { amount: 7000, category: "food", note: "หลังเที่ยงคืน", spentOn: first },
      "after",
      "form",
    );
    const boundary = new Date(`${first}T00:00:00+07:00`);
    const before = await spendingInsights(u, new Date(boundary.getTime() - 1)),
      after = await spendingInsights(u, boundary);
    expect(before.categories.find((c) => c.id === "food")?.spent).toBe(5000);
    expect(before.total).toBe(5000);
    expect(after.categories.find((c) => c.id === "food")?.spent).toBe(7000);
    expect(after.total).toBe(12000);
    expect(after.activeDays).toBe(2);
  });
  it("analytics aggregate every row beyond the REST 1000-row default without duplicate parent totals", async () => {
    const u = await user(),
      c = await saveSpendingCategory(u, {
        label: "Bulk",
        parent: "food",
        monthlyBudget: null,
      });
    const cycle = await db
      .from("cycles")
      .select("id")
      .eq("user_id", u)
      .single();
    expect(cycle.error).toBeNull();
    const rows = Array.from({ length: 1005 }, (_, i) => ({
      user_id: u,
      cycle_id: cycle.data!.id,
      amount: 101,
      category: "food",
      category_id: c.id,
      note: `bulk-${i}`,
      spent_on: today(),
      source: "form",
      idempotency_key: `bulk-${i}`,
    }));
    for (let offset = 0; offset < rows.length; offset += 200)
      expect(
        (await db.from("entries").insert(rows.slice(offset, offset + 200)))
          .error,
      ).toBeNull();
    const insights = await spendingInsights(u);
    expect(insights.count).toBe(1005);
    expect(insights.total).toBe(101505);
    expect(insights.categories.find((x) => x.id === c.id)?.spent).toBe(101505);
    expect(insights.categories.find((x) => x.id === "food")?.spent).toBe(
      101505,
    );
    expect(insights.recurring).toEqual([]);
    expect((await pointsState(u)).balance).toBe(1);
  });
  it("a confirmed expense awards one point and a retry or additional entries award no more", async () => {
    const u = await user(),
      key = crypto.randomUUID();
    expect(await pointsState(u)).toMatchObject({
      balance: 0,
      claimedToday: false,
    });
    await record(u, key);
    await record(u, key);
    await record(u);
    expect(await pointsState(u)).toMatchObject({
      balance: 1,
      claimedToday: true,
    });
    expect(await claimDailyPoints(u, "manual")).toMatchObject({
      balance: 1,
      created: false,
    });
  });
  it("income and many simultaneous expense inserts share the same one-point daily cap", async () => {
    const u = await user();
    await Promise.all([
      addIncome(
        u,
        { amount: 100000, note: "ทุน", receivedOn: today() },
        "income",
        "chat",
      ),
      ...Array.from({ length: 8 }, () => record(u)),
    ]);
    expect((await pointsState(u)).balance).toBe(1);
  });
  it("backdated entries and edits do not grant today's points; a new record today does", async () => {
    const u = await user(),
      r = await record(u, crypto.randomUUID(), addDays(today(), -1));
    await editEntry(u, r.entry.id, { amount: 6000, spentOn: today() });
    expect((await pointsState(u)).balance).toBe(0);
    await record(u);
    expect((await pointsState(u)).balance).toBe(1);
  });
  it("reversing a confirmed record does not multiply or claw back the daily activity point", async () => {
    const u = await user(),
      r = await record(u);
    await cancelEntry(u, r.entry.id);
    await record(u);
    expect((await pointsState(u)).balance).toBe(1);
  });
  it("manual claim before recording cannot earn a second point", async () => {
    const u = await user();
    await claimDailyPoints(u, "manual-first");
    await record(u);
    expect((await pointsState(u)).balance).toBe(1);
  });
  it("a failing wallet update rolls back the expense too", async () => {
    const u = await user();
    expect(
      (
        await db
          .from("points_wallets")
          .insert({ user_id: u, balance: 9007199254740991 })
      ).error,
    ).toBeNull();
    await expect(record(u)).rejects.toBeDefined();
    expect(
      (await db.from("entries").select("id").eq("user_id", u)).data,
    ).toEqual([]);
  });
  it("new users get base groups; custom spending is included in both its parent and its own tracker once", async () => {
    const u = await user();
    expect(await spendingCategories(u)).toHaveLength(5);
    const c = await saveSpendingCategory(u, {
      label: "ชานม",
      parent: "food",
      monthlyBudget: 8000,
    });
    const e = await record(u, crypto.randomUUID(), today(), c.id);
    expect(e.entry.categoryId).toBe(c.id);
    const data = await spendingInsights(u);
    expect(data.total).toBe(5000);
    expect(data.count).toBe(1);
    expect(data.categories.find((x) => x.id === c.id)).toMatchObject({
      spent: 5000,
      remaining: 3000,
    });
    expect(data.categories.find((x) => x.id === "food")?.spent).toBe(5000);
  });
  it("another account's category cannot be used or modified", async () => {
    const a = await user(),
      b = await user(),
      c = await saveSpendingCategory(a, {
        label: "เฉพาะฉัน",
        parent: "food",
        monthlyBudget: null,
      });
    await expect(
      record(b, crypto.randomUUID(), today(), c.id),
    ).rejects.toMatchObject({ code: "invalid_category" });
    await expect(
      saveSpendingCategory(b, { ...c, label: "เปลี่ยน" }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await pointsState(b)).balance).toBe(0);
  });
  it("renaming preserves ledger identity; old versions cannot overwrite newer budgets", async () => {
    const u = await user(),
      c = await saveSpendingCategory(u, {
        label: "ชานม",
        parent: "food",
        monthlyBudget: null,
      });
    await record(u, crypto.randomUUID(), today(), c.id);
    const saved = await saveSpendingCategory(u, {
      ...c,
      label: "เครื่องดื่ม",
      monthlyBudget: 10000,
    });
    await expect(
      saveSpendingCategory(u, { ...c, monthlyBudget: 20000 }),
    ).rejects.toMatchObject({ code: "stale" });
    expect(
      (await spendingInsights(u)).categories.find((x) => x.id === saved.id),
    ).toMatchObject({ label: "เครื่องดื่ม", spent: 5000, monthlyBudget: 10000 });
  });
  it("duplicate names and parent changes are rejected", async () => {
    const u = await user(),
      c = await saveSpendingCategory(u, {
        label: "ชานม",
        parent: "food",
        monthlyBudget: null,
      });
    await expect(
      saveSpendingCategory(u, {
        label: "ชานม",
        parent: "food",
        monthlyBudget: 100,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      saveSpendingCategory(u, { ...c, parent: "transport" }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("invalid parent/category combinations create no expense and no points", async () => {
    const u = await user(),
      c = await saveSpendingCategory(u, {
        label: "รถเมล์",
        parent: "transport",
        monthlyBudget: null,
      });
    await expect(
      record(u, crypto.randomUUID(), today(), c.id),
    ).rejects.toMatchObject({ code: "invalid_category" });
    expect((await pointsState(u)).balance).toBe(0);
  });
  it("moving an entry to a base category clears the custom tracker without duplicating total", async () => {
    const u = await user(),
      c = await saveSpendingCategory(u, {
        label: "ชานม",
        parent: "food",
        monthlyBudget: null,
      }),
      r = await record(u, crypto.randomUUID(), today(), c.id);
    await editEntry(u, r.entry.id, { category: "other" });
    const report = await spendingInsights(u);
    expect(report.total).toBe(5000);
    expect(report.categories.find((x) => x.id === c.id)?.spent).toBe(0);
    expect(report.categories.find((x) => x.id === "other")?.spent).toBe(5000);
  });
  it("editing an amount with the same base group preserves its personal category", async () => {
    const u = await user(),
      c = await saveSpendingCategory(u, {
        label: "ชานม",
        parent: "food",
        monthlyBudget: null,
      }),
      r = await record(u, crypto.randomUUID(), today(), c.id);
    expect(
      (await editEntry(u, r.entry.id, { amount: 6000, category: "food" }))
        .categoryId,
    ).toBe(c.id);
    expect(
      (await spendingInsights(u)).categories.find((x) => x.id === c.id)?.spent,
    ).toBe(6000);
    expect(
      (await editEntry(u, r.entry.id, { categoryId: null })).categoryId,
    ).toBeUndefined();
  });
  it("patterns require three distinct recorded days; cancelled entries and other accounts are excluded", async () => {
    const a = await user(),
      b = await user();
    await record(b);
    for (const n of [0, 1, 2])
      await record(a, crypto.randomUUID(), addDays(today(), -n));
    const extra = await record(a);
    await cancelEntry(a, extra.entry.id);
    const data = await spendingInsights(a);
    expect(data.recurring).toMatchObject([
      { label: "ชานม", count: 3, days: 3, amount: 15000 },
    ]);
    expect(data.total).toBe(15000);
    expect(data.activeDays).toBe(3);
  });
  it("empty history is honest and does not invent recommendations", async () => {
    const u = await user(),
      d = await spendingInsights(u);
    expect(d.count).toBe(0);
    expect(d.suggestions).toEqual([]);
    expect(d.observations.join()).toContain("ยังวิเคราะห์แพทเทิร์นไม่ได้");
  });
  it("anonymous callers cannot read settings, mutate them or analyze another account", async () => {
    const u = await user(),
      anon = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
    expect(
      (await anon.from("spending_categories").select("*").eq("user_id", u))
        .error,
    ).not.toBeNull();
    expect(
      (await anon.rpc("spending_insights", { p_user: u, p_today: today() }))
        .error,
    ).not.toBeNull();
    expect(
      (
        await anon.rpc("save_spending_category", {
          p_user: u,
          p_id: null,
          p_label: "x",
          p_parent: "food",
          p_budget: 100,
          p_version: null,
        })
      ).error,
    ).not.toBeNull();
  });
});
