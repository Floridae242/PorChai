import { describe, expect, it } from "vitest";
import { toHistoryItem, type LedgerRow } from "./rewards";

const base = { id: "x", created_at: "2026-11-15T17:30:00Z" }; // 00:30 on the 16th in Thailand

describe("toHistoryItem", () => {
  it("a daily point keeps its earned day and has no reward", () => {
    const row: LedgerRow = { ...base, kind: "daily", delta: 1, earned_on: "2026-11-15" };
    expect(toHistoryItem(row)).toEqual({ id: "x", kind: "daily", delta: 1, day: "2026-11-15", rewardName: null });
  });

  it("a redemption takes its day in Thai time and shows the reward name (object or array embed), never a code", () => {
    const obj: LedgerRow = { ...base, kind: "redemption", delta: -10, earned_on: null, reward_claims: { rewards: { name: "สติกเกอร์" } } };
    const arr: LedgerRow = { ...base, kind: "redemption", delta: -10, earned_on: null, reward_claims: [{ rewards: [{ name: "สติกเกอร์" }] }] };
    for (const row of [obj, arr]) {
      expect(toHistoryItem(row)).toEqual({ id: "x", kind: "redemption", delta: -10, day: "2026-11-16", rewardName: "สติกเกอร์" });
    }
  });

  it("a redemption whose reward cannot be read still lists, without a name", () => {
    expect(toHistoryItem({ ...base, kind: "redemption", delta: -10, earned_on: null, reward_claims: null })?.rewardName).toBeNull();
  });

  it("an unknown kind is skipped", () => {
    expect(toHistoryItem({ ...base, kind: "bonus", delta: 5, earned_on: null })).toBeNull();
  });
});
