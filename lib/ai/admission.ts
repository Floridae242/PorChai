import { positiveLimit } from "@/lib/runtime/limits";
import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "@/lib/db/client";

interface Scope { userId: string; deadline: number }
const scopes = new AsyncLocalStorage<Scope>();
export const AI_BUDGET_MS = 15_000;

// Nested advice inside a LINE request shares the original deadline; it cannot restart a 15s budget.
export function withAiScope<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const current = scopes.getStore();
  if (current?.userId === userId) return work();
  return scopes.run({ userId, deadline: Date.now() + AI_BUDGET_MS }, work);
}
export const aiDeadline = () => scopes.getStore()?.deadline ?? Date.now() + AI_BUDGET_MS;

// RPC counters are shared across instances. Only calls which reach the provider consume quota.
// Evaluations/direct transport unit tests have no authenticated scope and use their own call limit.
export async function admitAi(): Promise<boolean> {
  const scope = scopes.getStore();
  if (!scope) return true;
  try {
    const { data, error } = await getDb().rpc("consume_ai_quota", {
      p_user: scope.userId,
      p_global_limit: positiveLimit(process.env.AI_GLOBAL_RPM, 120, 100_000),
      p_user_limit: positiveLimit(process.env.AI_USER_RPM, 12, 1000),
    }).abortSignal(AbortSignal.timeout(Math.max(1, Math.min(2000, scope.deadline - Date.now()))));
    if (error) { console.info("ai outcome=quota_unavailable"); return false; }
    if (data !== true) console.info("ai outcome=rate_limited");
    return data === true;
  } catch { console.info("ai outcome=quota_unavailable"); return false; }
}

// Bounded state, O(1) admission/release. No unbounded in-process waiting queue.
export class AiGate {
  private active = 0;
  private failures = 0;
  private blockedUntil = 0;
  private probe = false;
  constructor(private readonly limit: number, private readonly now = Date.now) {}
  enter(): ((ok: boolean | null) => void) | null {
    if (this.active >= this.limit || this.now() < this.blockedUntil || this.probe) return null;
    const probing = this.blockedUntil !== 0;
    if (probing) this.probe = true;
    this.active++;
    let released = false;
    return (ok) => {
      if (released) return;
      released = true;
      this.active--;
      this.probe = false;
      if (ok) { this.failures = 0; this.blockedUntil = 0; }
      else if (ok === false && (++this.failures >= 5 || probing)) this.blockedUntil = this.now() + 30_000;
    };
  }
}
