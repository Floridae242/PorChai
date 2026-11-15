import { HttpError } from "@/lib/http";

const overloaded = () => new HttpError(503, "overloaded", "มีผู้ใช้หลายคนในขณะนี้ ลองใหม่อีกครั้ง");

// Bounded FIFO with O(1) admission, removal and timeout cancellation using insertion-ordered Map.
// A process-local bulkhead complements (not replaces) the database's shared connection pool.
export class WorkPool {
  private active = 0;
  private sequence = 0;
  private waiting = new Map<number, { resolve: (release: () => void) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly concurrency: number, private readonly maxQueue: number, private readonly waitMs: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxQueue) || maxQueue < 0 || !Number.isFinite(waitMs) || waitMs < 1) throw new RangeError("Invalid pool limits");
  }
  private release(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const first = this.waiting.entries().next().value;
      if (first) {
        const [id, waiter] = first;
        this.waiting.delete(id); clearTimeout(waiter.timer);
        this.active++;
        waiter.resolve(this.release());
      }
    };
  }
  private acquire(): Promise<() => void> {
    if (this.active < this.concurrency) { this.active++; return Promise.resolve(this.release()); }
    if (this.waiting.size >= this.maxQueue) return Promise.reject(overloaded());
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting.delete(id); reject(overloaded()); }, this.waitMs);
      this.waiting.set(id, { resolve, timer });
    });
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try { return await work(); } finally { release(); }
  }
}
