import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "./client";
import { loadReport } from "./reports";
const db = getDb();
const users: string[] = [];
async function fixture() {
  const u = await db
    .from("users")
    .insert({ line_user_id: `report-${crypto.randomUUID()}` })
    .select("id")
    .single();
  expect(u.error).toBeNull();
  users.push(u.data!.id);
  const c = await db
    .from("cycles")
    .insert({
      user_id: u.data!.id,
      start_balance: 1000000,
      payday: "2026-12-01",
    })
    .select("id")
    .single();
  expect(c.error).toBeNull();
  return { user_id: u.data!.id as string, cycle_id: c.data!.id as string };
}
afterEach(async () => {
  if (users.length)
    expect(
      (await db.from("users").delete().in("id", users.splice(0))).error,
    ).toBeNull();
});
describe("real calendar reports", () => {
  it("aggregates beyond REST caps, excludes cancellations and other users, includes paid bills once", async () => {
    const a = await fixture(),
      b = await fixture();
    expect(
      (
        await db.from("entries").insert(
          Array.from({ length: 1105 }, (_, i) => ({
            ...a,
            amount: 100,
            category: "food",
            note: "ข้าว",
            spent_on: "2026-11-15",
            source: "form",
            idempotency_key: `r${i}`,
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from("entries").insert([
          {
            ...a,
            amount: 1000,
          category: "bills",
            spent_on: "2026-11-15",
            source: "plan",
            idempotency_key: "bill",
          },
          { ...a, amount: 2500, category: "food", note: "อาหารในแผน", spent_on: "2026-11-15", source: "plan", idempotency_key: "planned-food" },
          {
            ...a,
            amount: 9999,
            category: "food",
            spent_on: "2026-11-15",
            source: "form",
            idempotency_key: "cancel",
            cancelled_at: new Date().toISOString(),
          },
          {
            ...b,
            amount: 99999,
            category: "food",
            spent_on: "2026-11-15",
            source: "form",
            idempotency_key: "other",
          },
          {
            ...a,
            amount: 500,
            category: "transport",
            spent_on: "2026-10-31",
            source: "form",
            idempotency_key: "old",
          },
        ])
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from("incomes").insert({
          ...a,
          amount: 200000,
          received_on: "2026-11-15",
          source: "form",
          idempotency_key: "income",
        })
      ).error,
    ).toBeNull();
    const report = await loadReport(
      a.user_id,
      "month",
      "2026-11-01",
      new Date("2026-11-15T12:00:00Z"),
    );
    expect(report).toMatchObject({
      spending: 114000,
      income: 200000,
      net: 86000,
      entriesCount: 1107,
    });
    expect(report.categories).toContainEqual({
      category: "food",
      amount: 113000,
      count: 1106,
    });
    expect(report.days).toHaveLength(30);
    expect(report.days.find((d) => d.date === "2026-11-16")?.spent).toBeNull();
    expect(report.days.find((d) => d.date === "2026-11-14")?.spent).toBe(0);
    expect((await loadReport(a.user_id, "day", "2026-10-31")).spending).toBe(
      500,
    );
  });
  it("returns an honest zero report for an account without a cycle", async () => {
    const u = await db
      .from("users")
      .insert({ line_user_id: `empty-${crypto.randomUUID()}` })
      .select("id")
      .single();
    expect(u.error).toBeNull();
    users.push(u.data!.id);
    expect(await loadReport(u.data!.id, "day", "2026-11-01")).toMatchObject({
      spending: 0,
      income: 0,
      net: 0,
      entriesCount: 0,
      categories: [],
    });
  });
});
