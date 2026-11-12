import { requireActiveCycle } from "@/lib/db/budget";
import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http";
import type { Essentials, NewCycle } from "@/lib/validate";

// One transaction in the database (create_cycle): the cycle and every bill / item, or nothing.
export async function createCycle(userId: string, c: NewCycle, today: string): Promise<void> {
  const { error } = await getDb().rpc("create_cycle", {
    p_user: userId,
    p_today: today,
    p_cycle: {
      start_balance: c.balance,
      start_balance_at: c.balanceAsOf?.toISOString() ?? null,
      payday: c.payday,
      emergency_buffer: c.emergencyBuffer,
      savings_amount: c.savingsAmount,
      savings_percent: c.savingsPercent,
      essential_food_daily: c.essentials?.food ?? null,
      essential_transport_daily: c.essentials?.transport ?? null,
      income_source: c.incomeSource,
      income_frequency: c.incomeFrequency,
    },
    p_plans: c.plans.map((p) => ({
      kind: p.kind,
      title: p.title,
      amount: p.amount,
      due_on: p.dueOn,
      status: p.status,
    })),
  });
  // PR409: an active cycle has not reached payday · 23505: a setup sent at the same moment won
  if (error?.code === "PR409" || error?.code === "23505") {
    throw new HttpError(409, "cycle_exists", "มีรอบเงินที่ยังไม่ถึงวันเงินเข้าอยู่แล้ว");
  }
  if (error) throw error;
}

// W7 / card 14 "ask first": food + transport a day for the active cycle
export async function setEssentials(userId: string, e: Essentials): Promise<void> {
  const cycle = await requireActiveCycle(userId);
  const { error } = await getDb()
    .from("cycles")
    .update({ essential_food_daily: e.food, essential_transport_daily: e.transport })
    .eq("id", cycle.id)
    .eq("user_id", userId);
  if (error) throw error;
}
