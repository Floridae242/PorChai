import type { Summary } from "@/lib/api-types";
import { computeBudget } from "@/lib/calc/budget";
import { balanceNow, latestAnchor, reservedTotal, spentOnDay, type BalanceAnchor } from "@/lib/calc/inputs";
import { thaiDate } from "@/lib/calc/time";
import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http";

export interface ActiveCycle {
  id: string;
  start_balance: number;
  start_balance_at: string;
  payday: string;
  emergency_buffer: number;
  savings_amount: number;
  essential_food_daily: number | null;
  essential_transport_daily: number | null;
}

// Every money action needs the caller's own active cycle; there is never a cycle id from the request.
export async function requireActiveCycle(userId: string): Promise<ActiveCycle> {
  const { data, error } = await getDb()
    .from("cycles")
    .select(
      "id, start_balance, start_balance_at, payday, emergency_buffer, savings_amount, essential_food_daily, essential_transport_daily",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, "no_cycle", "ยังไม่ได้ตั้งรอบเงิน ตั้งค่าก่อนเริ่มใช้");
  return data as ActiveCycle;
}

export async function currentAnchor(cycle: ActiveCycle): Promise<BalanceAnchor> {
  const { data, error } = await getDb().from("balance_checks").select("balance, as_of").eq("cycle_id", cycle.id);
  if (error) throw error;
  return latestAnchor(
    { amount: cycle.start_balance, asOf: new Date(cycle.start_balance_at) },
    data.map((c) => ({ amount: c.balance as number, asOf: new Date(c.as_of as string) })),
  );
}

// The one place stored rows become calculator input, so chat, screens and reminders agree.
export async function loadSummary(userId: string, now = new Date()): Promise<Summary> {
  const db = getDb();
  const cycle = await requireActiveCycle(userId);
  const [anchor, entries, plans] = await Promise.all([
    currentAnchor(cycle),
    db.from("entries").select("amount, spent_on, created_at, source").eq("cycle_id", cycle.id).is("cancelled_at", null),
    db.from("plans").select("amount, status, due_on").eq("cycle_id", cycle.id),
  ]);
  if (entries.error) throw entries.error;
  if (plans.error) throw plans.error;

  const today = thaiDate(now);
  const rows = entries.data.map((e) => ({
    amount: e.amount as number,
    spentOn: e.spent_on as string,
    createdAt: new Date(e.created_at as string),
    fromPlan: e.source === "plan",
  }));
  const input = {
    balance: balanceNow(anchor, rows),
    spentToday: spentOnDay(rows, today),
    emergencyBuffer: cycle.emergency_buffer,
    savings: cycle.savings_amount,
    reserved: reservedTotal(
      plans.data.map((p) => ({ amount: p.amount, status: p.status, dueOn: p.due_on })),
      cycle.payday,
    ),
    // Set together (DB check); null until the user says
    essentialPerDay:
      cycle.essential_food_daily === null || cycle.essential_transport_daily === null
        ? null
        : cycle.essential_food_daily + cycle.essential_transport_daily,
    today,
    payday: cycle.payday,
  };
  return {
    today,
    payday: cycle.payday,
    balance: input.balance,
    balanceAsOf: anchor.asOf.toISOString(),
    spentToday: input.spentToday,
    savings: input.savings,
    emergencyBuffer: input.emergencyBuffer,
    reserved: input.reserved,
    essentialPerDay: input.essentialPerDay,
    budget: computeBudget(input),
  };
}
