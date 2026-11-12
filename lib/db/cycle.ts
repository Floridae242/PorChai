import { setAsideFits } from "@/lib/calc/inputs";
import { loadBudget, requireActiveCycle, requireBasis } from "@/lib/db/budget";
import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http";
import {
  invalid,
  SET_ASIDE_OVER,
  type BufferChange,
  type Essentials,
  type NewCycle,
  type PaydayChange,
} from "@/lib/validate";

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

const STALE = () => new HttpError(409, "stale", "เงินเผื่อถูกเปลี่ยนจากอีกหน้าจอแล้ว โหลดใหม่ก่อนยืนยัน");

// Card 19: set the buffer to a new amount (use part of it, or set more aside). Real money never moves.
// Setting, not subtracting, so a double tap cannot take twice; `previous` guards against another screen.
export async function setBuffer(userId: string, change: BufferChange, now = new Date()): Promise<void> {
  const { cycle, input } = await loadBudget(userId, now);
  if (cycle.emergency_buffer === change.amount) return;
  if (cycle.emergency_buffer !== change.previous) throw STALE();
  if (!setAsideFits(input.balance, input.savings, change.amount)) throw invalid(SET_ASIDE_OVER);

  const db = getDb();
  // Only if it is still what the screen showed; a concurrent confirm that got here first wins
  const { data, error } = await db
    .from("cycles")
    .update({ emergency_buffer: change.amount })
    .eq("id", cycle.id)
    .eq("user_id", userId)
    .eq("emergency_buffer", change.previous)
    .select("id");
  if (error) throw error;
  if (data.length > 0) return;

  const now2 = await requireActiveCycle(userId);
  if (now2.emergency_buffer !== change.amount) throw STALE(); // same amount = the other tap of a double tap
}

// Card 23: money coming late (or early). Only on the numbers the screen showed (basis); more days
// simply means the essentials cover more days. No income is assumed and no spend is touched.
export async function setPayday(userId: string, change: PaydayChange, now = new Date()): Promise<void> {
  const loaded = await loadBudget(userId, now);
  const { cycle } = loaded;
  if (cycle.payday === change.payday) return; // the other tap of a double tap
  requireBasis(loaded, change.basis);

  const { data, error } = await getDb()
    .from("cycles")
    .update({ payday: change.payday })
    .eq("id", cycle.id)
    .eq("user_id", userId)
    .eq("payday", cycle.payday)
    .select("id");
  if (error) throw error;
  if (data.length > 0) return;
  const latest = await requireActiveCycle(userId);
  if (latest.payday !== change.payday) {
    throw new HttpError(409, "stale", "ข้อมูลเปลี่ยนไปแล้ว ดูผลคำนวณใหม่ก่อนยืนยัน");
  }
}
