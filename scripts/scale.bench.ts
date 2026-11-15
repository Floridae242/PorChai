import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { loadSummary } from "@/lib/db/budget";
import { addDays, thaiDate } from "@/lib/calc/time";

// Real local PostgREST traffic, 1,000 distinct accounts. Never LINE, Gemini or a hosted database.
// This isolates budget reads; it is not an end-to-end production capacity certification.
it("measures 1,000 concurrent local budget snapshots", async () => {
  const db = getDb();
  const count = 1000;
  const run = `bench-${crypto.randomUUID()}`;
  const ids: string[] = [];
  const durations: number[] = [];
  let failures = 0;
  const failureCodes: Record<string, number> = {};
  let firstFailureMessage: string | null = null;
  try {
    const inserted = await db.from("users").insert(Array.from({ length: count }, (_, n) => ({ line_user_id: `${run}-${n}` }))).select("id");
    expect(inserted.error).toBeNull();
    ids.push(...inserted.data!.map((u) => u.id as string));
    expect(ids).toHaveLength(count);
    const today = thaiDate(new Date());
    const cycles = await db.from("cycles").insert(ids.map((id) => ({ user_id: id, start_balance: 100_000, emergency_buffer: 0, payday: addDays(today, 10) })));
    expect(cycles.error).toBeNull();
    // Warm up the function/connection pool independently of measured traffic.
    await loadSummary(ids[0]);
    const started = performance.now();
    await Promise.all(ids.map(async (id) => {
      const t = performance.now();
      try {
        const result = await loadSummary(id);
        if (result.balance !== 100_000 || result.budget.kind !== "ok" || result.budget.dailyBudget !== 10_000) failures++;
      } catch (error) {
        failures++;
        const e = error as { code?: string; message?: string };
        const code = typeof e?.code === "string" && /^[A-Z0-9_]{1,30}$/i.test(e.code) ? e.code : "transport";
        failureCodes[code] = (failureCodes[code] ?? 0) + 1;
        firstFailureMessage ??= typeof e?.message === "string" ? e.message.slice(0, 200) : "unknown";
      }
      durations.push(performance.now() - t);
    }));
    const elapsedMs = performance.now() - started;
    durations.sort((a, b) => a - b);
    const percentile = (p: number) => Math.round(durations[Math.ceil(p * durations.length) - 1]);
    const report = { at: new Date().toISOString(), scope: "local budget RPC + calculator only", concurrentRequests: count, completed: count - failures, failures, failureCodes, firstFailureMessage, elapsedMs: Math.round(elapsedMs), requestsPerSecond: Math.round(count / (elapsedMs / 1000)), p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99) };
    writeFileSync("scripts/scale-benchmark-report.json", JSON.stringify(report, null, 2) + "\n");
    console.info(JSON.stringify(report));
    expect(failures).toBe(0);
  } finally {
    // Delete by this run's prefix even if an initial insert succeeded but returned an error.
    const cleanup = await db.from("users").delete().like("line_user_id", `${run}-%`);
    expect(cleanup.error).toBeNull();
  }
});
