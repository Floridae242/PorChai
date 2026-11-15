import { describe, expect, it } from "vitest";
import { runKeyed } from "./keyed-work";

describe("keyed webhook worker pool", () => {
  it("keeps each user's order with at most four independent jobs, even at 1,000 events", async () => {
    let active = 0;
    let max = 0;
    const users = new Set<string>();
    const seen = new Map<string, number[]>();
    await runKeyed(Array.from({ length: 1000 }, (_, n) => ({ user: `u${n % 100}`, n })), (x) => x.user, async (x) => {
      expect(users.has(x.user)).toBe(false);
      users.add(x.user); max = Math.max(max, ++active);
      await Promise.resolve();
      const list = seen.get(x.user) ?? []; list.push(x.n); seen.set(x.user, list);
      users.delete(x.user); active--;
    });
    expect(max).toBe(4);
    for (const list of seen.values()) expect(list).toEqual([...list].sort((a, b) => a - b));
    expect([...seen.values()].flat()).toHaveLength(1000);
  });
  it("waits for independent work to settle before rejecting a batch", async () => {
    let finished = false;
    await expect(runKeyed([1, 2], String, async (x) => {
      if (x === 1) throw new Error("failed");
      await Promise.resolve(); finished = true;
    })).rejects.toThrow("failed");
    expect(finished).toBe(true);
  });
});
