import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/db/notifications";
import { deliverDigestBatch } from "./digests";
import { push } from "@/lib/line/push";
vi.mock("@/lib/line/push", () => ({ push: vi.fn(async () => {}) }));
const db = getDb(),
  users: string[] = [];
async function account() {
  const r = await db
    .from("users")
    .insert({ line_user_id: `digest-${crypto.randomUUID()}` })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  users.push(r.data!.id);
  return r.data!.id as string;
}
beforeEach(() => vi.mocked(push).mockReset().mockResolvedValue());
afterEach(async () => {
  if (users.length)
    expect(
      (await db.from("users").delete().in("id", users.splice(0))).error,
    ).toBeNull();
});
describe("opt-in LINE digest worker", () => {
  it("warns once for overspending and respects Thai quiet hours", async () => {
    const u = await account();
    const cycle = await db
      .from("cycles")
      .insert({
        user_id: u,
        start_balance: 240000,
        start_balance_at: "2026-11-15T00:00:00Z",
        payday: "2026-11-25",
      })
      .select("id")
      .single();
    expect(cycle.error).toBeNull();
    expect(
      (
        await db
          .from("entries")
          .insert({
            user_id: u,
            cycle_id: cycle.data!.id,
            amount: 50000,
            category: "food",
            note: "อาหาร",
            spent_on: "2026-11-15",
            created_at: "2026-11-15T01:00:00Z",
            source: "form",
            idempotency_key: "overspent",
          })
      ).error,
    ).toBeNull();
    await saveNotificationPreferences(u, {
      daily: false,
      monthly: false,
      budget: true,
      time: "20:00",
    });
    await deliverDigestBatch(undefined, new Date("2026-11-15T00:00:00Z"));
    expect(push).not.toHaveBeenCalled();
    const now = new Date("2026-11-15T09:00:00Z");
    await deliverDigestBatch(undefined, now);
    expect(push).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(push).mock.calls[0][1])).toContain(
      "เตือนงบวันนี้",
    );
    await deliverDigestBatch(undefined, now);
    expect(push).toHaveBeenCalledTimes(1);
  });
  it("expired notification leases retain the retry ID and reject acknowledgement by the old owner", async () => {
    const u = await account(),
      first = crypto.randomUUID(),
      second = crypto.randomUUID();
    const a = await db.rpc("claim_notification", {
      p_user: u,
      p_kind: "daily",
      p_period: "2026-11-15",
      p_owner: first,
    });
    expect(a.error).toBeNull();
    expect(
      (
        await db
          .from("notification_deliveries")
          .update({ lease_until: "2000-01-01T00:00:00Z" })
          .eq("id", a.data)
      ).error,
    ).toBeNull();
    const b = await db.rpc("claim_notification", {
      p_user: u,
      p_kind: "daily",
      p_period: "2026-11-15",
      p_owner: second,
    });
    expect(b.error).toBeNull();
    expect(b.data).toBe(a.data);
    const old = await db
      .from("notification_deliveries")
      .update({ state: "sent" })
      .eq("id", a.data)
      .eq("owner", first)
      .select("id");
    expect(old.error).toBeNull();
    expect(old.data).toEqual([]);
  });
  it("defaults off and does not push anything for a new account", async () => {
    const u = await account();
    expect(await getNotificationPreferences(u)).toEqual({
      daily: false,
      monthly: false,
      budget: false,
      time: "20:00",
    });
    await deliverDigestBatch(undefined, new Date("2026-11-15T14:00:00Z"));
    expect(push).not.toHaveBeenCalled();
  });
  it("validates preferences and never reads or changes another account", async () => {
    const a = await account(),
      b = await account();
    await saveNotificationPreferences(a, {
      daily: true,
      monthly: false,
      budget: false,
      time: "19:00",
      userId: b,
    });
    expect((await getNotificationPreferences(b)).daily).toBe(false);
    await expect(
      saveNotificationPreferences(a, {
        daily: "true",
        monthly: false,
        budget: false,
        time: "25:00",
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("overlapping cron calls push one daily report with a persistent retry UUID", async () => {
    const u = await account();
    await saveNotificationPreferences(u, {
      daily: true,
      monthly: false,
      budget: false,
      time: "20:00",
    });
    const now = new Date("2026-11-15T14:00:00Z");
    await Promise.all([
      deliverDigestBatch(undefined, now),
      deliverDigestBatch(undefined, now),
    ]);
    expect(push).toHaveBeenCalledTimes(1);
    const row = await db
      .from("notification_deliveries")
      .select("id,state")
      .eq("user_id", u)
      .single();
    expect(row.error).toBeNull();
    expect(row.data!.state).toBe("sent");
    expect(vi.mocked(push).mock.calls[0][2]).toBe(row.data!.id);
    await deliverDigestBatch(undefined, now);
    expect(push).toHaveBeenCalledTimes(1);
  });
  it("a failed push can retry after its lease with the same LINE retry key", async () => {
    const u = await account();
    await saveNotificationPreferences(u, {
      daily: true,
      monthly: false,
      budget: false,
      time: "20:00",
    });
    const now = new Date("2026-11-15T14:00:00Z");
    vi.mocked(push).mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await deliverDigestBatch(undefined, now)).failed).toBe(1);
    const key = vi.mocked(push).mock.calls[0][2];
    expect(
      (
        await db
          .from("notification_deliveries")
          .update({ lease_until: "2000-01-01T00:00:00Z" })
          .eq("user_id", u)
      ).error,
    ).toBeNull();
    await deliverDigestBatch(undefined, now);
    expect(vi.mocked(push).mock.calls[1][2]).toBe(key);
  });
  it("monthly reports only send on the first Thai day and use the previous month", async () => {
    const u = await account();
    await saveNotificationPreferences(u, {
      daily: false,
      monthly: true,
      budget: false,
      time: "08:00",
    });
    await deliverDigestBatch(undefined, new Date("2026-11-30T02:00:00Z"));
    expect(push).not.toHaveBeenCalled();
    await deliverDigestBatch(undefined, new Date("2026-12-01T02:00:00Z"));
    expect(push).toHaveBeenCalledTimes(1);
    const row = await db
      .from("notification_deliveries")
      .select("period")
      .eq("user_id", u)
      .single();
    expect(row.data!.period).toBe("2026-11");
  });
});
