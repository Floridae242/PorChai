import { WorkPool } from "@/lib/runtime/work-pool";
import { positiveLimit } from "@/lib/runtime/limits";
import { createHash } from "node:crypto";
import type { Summary } from "@/lib/api-types";
import { computeBudget, type BudgetInput } from "@/lib/calc/budget";
import {
  latestAnchor,
  reservedTotal,
  type BalanceAnchor,
  type PlanLike,
} from "@/lib/calc/inputs";
import { thaiDate } from "@/lib/calc/time";
import { formatThaiDate } from "@/lib/format/date";
import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http";

const budgetReads = new WorkPool(positiveLimit(process.env.DB_READ_CONCURRENCY, 32, 128), 1024, 5000);

export interface ActiveCycle {
  id: string;
  start_balance: number;
  start_balance_at: string;
  started_at: string;
  payday: string;
  emergency_buffer: number;
  savings_amount: number;
  essential_food_daily: number | null;
  essential_transport_daily: number | null;
}

// A spend or income dated before the cycle began belongs to no cycle here (the API took 1999, 16 Nov)
export function requireInCycle(date: string, startedAt: string): void {
  const first = thaiDate(new Date(startedAt));
  if (date < first) throw new HttpError(422, "invalid_input", `วันที่ต้องอยู่ในรอบเงินนี้ ตั้งแต่ ${formatThaiDate(first, "long")} ถึงวันนี้`);
}

// Every money action needs the caller's own active cycle; there is never a cycle id from the request.
export async function requireActiveCycle(userId: string): Promise<ActiveCycle> {
  const { data, error } = await getDb()
    .from("cycles")
    .select(
      "id, start_balance, start_balance_at, started_at, payday, emergency_buffer, savings_amount, essential_food_daily, essential_transport_daily",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, "no_cycle", "ยังไม่ได้ตั้งรอบเงิน ตั้งค่าก่อนเริ่มใช้");
  return data as ActiveCycle;
}

export async function currentAnchor(cycle: ActiveCycle): Promise<BalanceAnchor> {
  const { data, error } = await getDb().from("balance_checks").select("balance, as_of").eq("cycle_id", cycle.id).order("as_of", { ascending: false }).order("created_at").order("id").limit(1);
  if (error) throw error;
  return latestAnchor(
    { amount: cycle.start_balance, asOf: new Date(cycle.start_balance_at) },
    data.map((c) => ({ amount: c.balance as number, asOf: new Date(c.as_of as string) })),
  );
}

export interface PlanRow {
  id: string;
  title: string;
  kind: "bill" | "purchase";
  amount: number;
  status: PlanLike["status"];
  due_on: string | null;
}

export interface LoadedBudget {
  cycle: ActiveCycle;
  anchor: BalanceAnchor;
  plans: PlanRow[];
  input: BudgetInput;
}

// The one place stored rows become calculator input, so chat, screens, tries and reminders agree.
export async function loadBudget(userId: string, now = new Date()): Promise<LoadedBudget> {
  const today = thaiDate(now);
  const { data, error } = await budgetReads.run(async () =>
    await getDb().rpc("budget_snapshot", { p_user: userId, p_today: today }).abortSignal(AbortSignal.timeout(5000)),
  );
  if (error) throw error;
  if (!data) throw new HttpError(409, "no_cycle", "ยังไม่ได้ตั้งรอบเงิน ตั้งค่าก่อนเริ่มใช้");
  const snapshot = data as {
    cycle: ActiveCycle;
    anchor: { amount: number; asOf: string };
    balance: number;
    spentToday: number;
    plans: PlanRow[];
  };
  const cycle = snapshot.cycle;
  const anchor = { amount: snapshot.anchor.amount, asOf: new Date(snapshot.anchor.asOf) };
  const planRows = snapshot.plans;
  const input: BudgetInput = {
    balance: snapshot.balance,
    spentToday: snapshot.spentToday,
    emergencyBuffer: cycle.emergency_buffer,
    savings: cycle.savings_amount,
    reserved: reservedTotal(planRows.map((p) => ({ amount: p.amount, status: p.status, dueOn: p.due_on })), cycle.payday),
    essentialPerDay: cycle.essential_food_daily === null || cycle.essential_transport_daily === null
      ? null : cycle.essential_food_daily + cycle.essential_transport_daily,
    today,
    payday: cycle.payday,
  };
  if (![anchor.amount, input.balance, input.spentToday, input.emergencyBuffer, input.savings, input.reserved,
    ...(input.essentialPerDay === null ? [] : [input.essentialPerDay])].every(Number.isSafeInteger)) {
    throw new HttpError(503, "amount_out_of_range", "ยอดเงินเกินขอบเขตที่คำนวณได้ กรุณาติดต่อทีมงาน");
  }
  return { cycle, anchor, plans: planRows, input };
}

export async function loadSummary(userId: string, now = new Date()): Promise<Summary> {
  return summaryOf(await loadBudget(userId, now));
}

// Card 23: a fingerprint of every number the calculator used. A screen sends back the basis it showed;
// if anything changed since (a spend, a plan, ปรับยอด, a setting, a new day) the confirm is refused.
// Derived, not stored, so no table needs a version column kept in step.
export function basisOf(input: BudgetInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("base64url").slice(0, 16);
}

export function requireBasis(loaded: LoadedBudget, seen: string): void {
  if (basisOf(loaded.input) !== seen) {
    throw new HttpError(409, "stale", "ข้อมูลเปลี่ยนไปแล้ว ดูผลคำนวณใหม่ก่อนยืนยัน");
  }
}

export function summaryOf({ anchor, input }: LoadedBudget): Summary {
  return {
    today: input.today,
    payday: input.payday,
    balance: input.balance,
    balanceAsOf: anchor.asOf.toISOString(),
    spentToday: input.spentToday,
    savings: input.savings,
    emergencyBuffer: input.emergencyBuffer,
    reserved: input.reserved,
    essentialPerDay: input.essentialPerDay,
    budget: computeBudget(input),
    basis: basisOf(input),
  };
}
