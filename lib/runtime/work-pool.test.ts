import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkPool } from "./work-pool";
afterEach(() => vi.useRealTimers());

describe("database backpressure", () => {
  it("serves 1,000 incoming jobs in FIFO order with 32 active jobs at most", async () => {
    const pool = new WorkPool(32, 1024, 5000);
    let active = 0; let peak = 0; const seen: number[] = [];
    const results = await Promise.all(Array.from({ length: 1000 }, (_, n) => pool.run(async () => {
      peak = Math.max(peak, ++active); seen.push(n); await Promise.resolve(); active--; return n;
    })));
    expect(peak).toBe(32);
    expect(seen).toEqual(results);
    expect(results).toHaveLength(1000);
  });
  it("rejects excess jobs, frees failed jobs, and removes timed-out waiters", async () => {
    vi.useFakeTimers();
    const pool = new WorkPool(1, 1, 10);
    let release!: () => void;
    const first = pool.run(() => new Promise<void>((resolve) => { release = resolve; }));
    const queued = pool.run(async () => "should not run");
    const rejected = expect(queued).rejects.toMatchObject({ status: 503, code: "overloaded" });
    await expect(pool.run(async () => "overflow")).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(11); await rejected;
    release(); await first;
    await expect(pool.run(async () => { throw new Error("failure"); })).rejects.toThrow("failure");
    expect(await pool.run(async () => "next")).toBe("next");
  });
});
