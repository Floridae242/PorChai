import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import {
  createBillSchedule,
  listBillSchedules,
  updateBillSchedule,
} from "@/lib/db/bills";
import { actOnPlan, listPlans } from "@/lib/db/plans";
import { deliverBillBatch } from "./bills";
import { push } from "@/lib/line/push";
vi.mock("@/lib/line/push", () => ({ push: vi.fn(async () => {}) }));
const db = getDb(),
  users: string[] = [],
  now = new Date("2026-11-15T02:00:00Z");
async function account(payday = "2026-12-15") {
  const u = await db
    .from("users")
    .insert({ line_user_id: `bill-test-${crypto.randomUUID()}` })
    .select("id")
    .single();
  expect(u.error).toBeNull();
  const id = u.data!.id;
  users.push(id);
  expect(
    (
      await db
        .from("cycles")
        .insert({ user_id: id, start_balance: 1000000, payday })
    ).error,
  ).toBeNull();
  return id as string;
}
const input = {
  title: "ค่าหอ",
  amount: 300000,
  startsOn: "2026-11-18",
  repeat: "monthly",
  notify: true,
} as const;
beforeEach(() => {
  vi.stubEnv("LINE_BILL_REMINDERS_ENABLED", "1");
  vi.mocked(push).mockReset().mockResolvedValue();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (users.length)
    expect(
      (await db.from("users").delete().in("id", users.splice(0))).error,
    ).toBeNull();
});
describe("bill schedules and opt-in notifications", () => {
  it("bounds a busy page and resumes unsent bills without duplicates", async () => {
    const u = await account();
    for (let n = 0; n < 21; n++)
      await createBillSchedule(
        u,
        { ...input, title: `บิล ${n}`, repeat: "once" },
        `many-${n}`,
        now,
      );
    const first = await deliverBillBatch(undefined, now);
    expect(first.sent).toBe(20);
    expect(first.repeatPage).toBe(true);
    expect(first.nextCursor).toBeNull();
    const second = await deliverBillBatch(undefined, now);
    expect(second.sent).toBe(1);
    expect(second.repeatPage).toBe(false);
    expect(push).toHaveBeenCalledTimes(21);
    expect(new Set(vi.mocked(push).mock.calls.map((c) => c[2])).size).toBe(21);
  });
  it("new accounts opt in per bill; quiet hours and other owners cannot claim a delivery", async () => {
    const u = await account(),
      other = await account(),
      s = await createBillSchedule(
        u,
        { ...input, repeat: "once" },
        "ownership",
        now,
      ),
      plan = (await listPlans(u)).find((p) => p.billScheduleId === s.id)!;
    expect(
      (
        await db.rpc("claim_bill_notification", {
          p_user: other,
          p_plan: plan.id,
          p_lead: 3,
          p_today: "2026-11-15",
          p_owner: crypto.randomUUID(),
        })
      ).data,
    ).toBeNull();
    await deliverBillBatch(undefined, new Date("2026-11-15T15:00:00Z"));
    expect(push).not.toHaveBeenCalled();
    await updateBillSchedule(u, s.id, { notify: false }, now);
    await deliverBillBatch(undefined, now);
    expect(push).not.toHaveBeenCalled();
  });
  it("anonymous clients cannot invoke financial/notification RPCs", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      ),
      u = await account();
    expect(
      (
        await anon.rpc("sync_bill_schedules", {
          p_user: u,
          p_today: "2026-11-15",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (await anon.rpc("bill_notification_accounts", { p_after: null })).error,
    ).not.toBeNull();
  });
  it("returns the accepted schedule on retry after Thai midnight", async () => {
    const u = await account();
    const p = { ...input, startsOn: "2026-11-15" };
    const first = await createBillSchedule(u, p, "midnight", now);
    expect(
      (
        await createBillSchedule(
          u,
          p,
          "midnight",
          new Date("2026-11-16T02:00:00Z"),
        )
      ).id,
    ).toBe(first.id);
    await expect(
      createBillSchedule(u, p, "new-key", new Date("2026-11-16T02:00:00Z")),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("new active cycles extend monthly obligations even with notifications disabled and no worker", async () => {
    const u = await account();
    const s = await createBillSchedule(
      u,
      { ...input, notify: false },
      "cycle-repeat",
      now,
    );
    vi.stubEnv("LINE_BILL_REMINDERS_ENABLED", "0");
    expect(
      (await db.from("cycles").update({ status: "closed" }).eq("user_id", u))
        .error,
    ).toBeNull();
    expect(
      (
        await db
          .from("cycles")
          .insert({ user_id: u, start_balance: 1000000, payday: "2027-03-15" })
      ).error,
    ).toBeNull();
    const plans = await listPlans(u);
    expect(
      plans.some((p) => p.billScheduleId === s.id && p.dueOn === "2027-03-18"),
    ).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });
  it("creates dated plans atomically with no expenses; identical concurrent requests return one schedule", async () => {
    const u = await account();
    const results = await Promise.all([
      createBillSchedule(u, input, "same", now),
      createBillSchedule(u, input, "same", now),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await listBillSchedules(u)).toHaveLength(1);
    const plans = await listPlans(u);
    expect(plans.map((p) => p.dueOn).sort()).toEqual([
      "2026-11-18",
      "2026-12-18",
    ]);
    expect(plans.every((p) => p.billScheduleId === results[0].id)).toBe(true);
    expect(
      (await db.from("entries").select("id").eq("user_id", u)).data,
    ).toEqual([]);
  });
  it("clamps January 31 to February 28 then restores March 31; sync does not duplicate obligations", async () => {
    const u = await account("2027-04-01");
    await createBillSchedule(
      u,
      { ...input, startsOn: "2027-01-31" },
      "month-end",
      new Date("2027-01-15T02:00:00Z"),
    );
    for (let i = 0; i < 2; i++)
      expect(
        (
          await db.rpc("sync_bill_schedules", {
            p_user: u,
            p_today: "2027-02-01",
          })
        ).error,
      ).toBeNull();
    expect((await listPlans(u)).map((p) => p.dueOn).sort()).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });
  it("only sends at/after 09:00 Thai time, once for each of 3 days before and due day", async () => {
    const u = await account();
    await createBillSchedule(u, input, "n", now);
    await deliverBillBatch(undefined, new Date("2026-11-15T01:59:00Z"));
    expect(push).not.toHaveBeenCalled();
    await Promise.all([
      deliverBillBatch(undefined, now),
      deliverBillBatch(undefined, now),
    ]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(push).mock.calls[0][1])).toContain(
      "อีก 3 วัน",
    );
    await deliverBillBatch(undefined, new Date("2026-11-16T02:00:00Z"));
    expect(push).toHaveBeenCalledTimes(1);
    await deliverBillBatch(undefined, new Date("2026-11-18T02:00:00Z"));
    expect(push).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(push).mock.calls[1][1])).toContain(
      "ครบกำหนดวันนี้",
    );
    await deliverBillBatch(undefined, new Date("2026-11-18T03:00:00Z"));
    expect(push).toHaveBeenCalledTimes(2);
  });
  it("paid, cancelled and notification-off bills never send", async () => {
    const u = await account();
    await createBillSchedule(u, { ...input, repeat: "once" }, "paid", now);
    const [p] = await listPlans(u);
    await actOnPlan(u, p.id, "pay", null, "2026-11-15");
    await deliverBillBatch(undefined, now);
    expect(push).not.toHaveBeenCalled();
    const s = await createBillSchedule(
      u,
      { ...input, title: "น้ำ", repeat: "once", notify: false },
      "off",
      now,
    );
    await deliverBillBatch(undefined, now);
    expect(push).not.toHaveBeenCalled();
    await updateBillSchedule(u, s.id, { notify: true }, now);
    const p2 = (await listPlans(u)).find((p) => p.billScheduleId === s.id)!;
    await actOnPlan(u, p2.id, "cancel", null, "2026-11-15");
    await deliverBillBatch(undefined, now);
    expect(push).not.toHaveBeenCalled();
  });
  it("stopping a series cancels only unpaid bills from today; another user cannot change it", async () => {
    const u = await account(),
      other = await account(),
      s = await createBillSchedule(u, input, "stop", now);
    await expect(
      updateBillSchedule(other, s.id, { stop: true }, now),
    ).rejects.toMatchObject({ status: 404 });
    const first = (await listPlans(u))[0];
    await actOnPlan(u, first.id, "pay", null, "2026-11-15");
    await updateBillSchedule(u, s.id, { stop: true }, now);
    expect((await listPlans(u)).map((p) => p.status).sort()).toEqual([
      "cancelled",
      "paid",
    ]);
    await deliverBillBatch(undefined, now);
    expect(push).not.toHaveBeenCalled();
  });
  it("keeps the same retry key after failure and rejects old-owner acknowledgement", async () => {
    const u = await account();
    await createBillSchedule(u, { ...input, repeat: "once" }, "retry", now);
    vi.mocked(push).mockRejectedValueOnce(new Error("offline"));
    expect((await deliverBillBatch(undefined, now)).failed).toBe(1);
    const key = vi.mocked(push).mock.calls[0][2];
    const old = await db
      .from("bill_deliveries")
      .select("owner")
      .eq("id", key)
      .single();
    expect(old.error).toBeNull();
    expect(
      (
        await db
          .from("bill_deliveries")
          .update({ lease_until: "2000-01-01T00:00:00Z" })
          .eq("id", key)
      ).error,
    ).toBeNull();
    await deliverBillBatch(undefined, now);
    expect(vi.mocked(push).mock.calls[1][2]).toBe(key);
    expect(
      (
        await db
          .from("bill_deliveries")
          .update({ state: "processing" })
          .eq("id", key)
          .eq("owner", old.data!.owner)
          .select("id")
      ).data,
    ).toEqual([]);
  });
  it("defaults off at the worker switch, and does not call LINE", async () => {
    const u = await account();
    await createBillSchedule(u, input, "flag", now);
    vi.stubEnv("LINE_BILL_REMINDERS_ENABLED", "0");
    expect((await deliverBillBatch(undefined, now)).enabled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
  it("deleting an account also removes schedules, dated plans and delivery ledgers", async () => {
    const u = await account();
    await createBillSchedule(u, input, "delete", now);
    await deliverBillBatch(undefined, now);
    expect((await db.rpc("delete_my_account", { p_user: u })).error).toBeNull();
    for (const t of ["bill_schedules", "plans", "bill_deliveries"])
      expect((await db.from(t).select("id").eq("user_id", u)).data).toEqual([]);
  });
});
