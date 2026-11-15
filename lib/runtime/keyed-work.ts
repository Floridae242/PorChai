// Each key is FIFO; independent keys share a bounded worker pool. O(n) grouping with Map.
export async function runKeyed<T>(items: readonly T[], keyOf: (item: T, index: number) => string, work: (item: T) => Promise<void>, concurrency = 4): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError("Invalid concurrency");
  const groups = new Map<string, T[]>();
  items.forEach((item, index) => {
    const key = keyOf(item, index);
    const group = groups.get(key);
    if (group) group.push(item); else groups.set(key, [item]);
  });
  const queue = [...groups.values()];
  let next = 0;
  // Wait for every worker even after failure; no work outlives a rejected batch promise.
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const group = queue[next++];
      if (!group) return;
      for (const item of group) await work(item);
    }
  });
  const results = await Promise.allSettled(workers);
  const failed = results.find((r) => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
