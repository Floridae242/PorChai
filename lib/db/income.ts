import { requireActiveCycle, requireInCycle } from "@/lib/db/budget";
import { HttpError } from "@/lib/http";
import { getDb } from "@/lib/db/client";
import type { NewIncome } from "@/lib/validate";
import type { Income } from "@/lib/api-types";

interface Row { id: string; amount: number; note: string | null; received_on: string; source: Income["source"]; created_at: string }

// แผนเงิน › รายรับ: this cycle's incomes, cancelled ones left out, newest first (16 Nov: there was no way to read them)
export async function listIncomes(userId: string): Promise<Income[]> {
  const cycle = await requireActiveCycle(userId);
  const { data, error } = await getDb()
    .from("incomes")
    .select("id, amount, note, received_on, source, created_at")
    .eq("user_id", userId)
    .eq("cycle_id", cycle.id)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map((r) => ({
    id: r.id, amount: r.amount, note: r.note, receivedOn: r.received_on, source: r.source, createdAt: r.created_at,
  }));
}

// รายรับ (migration 20261113200000_incomes). Same key for the same user = the same income: a retry,
// a double tap or LINE redelivering «รับ 500» adds it once.
export async function addIncome(
  userId: string,
  input: NewIncome,
  idempotencyKey: string,
  source: "chat" | "form",
): Promise<{ created: boolean }> {
  const cycle = await requireActiveCycle(userId);
  requireInCycle(input.receivedOn, cycle.started_at);
  const { error } = await getDb().from("incomes").insert({
    user_id: userId,
    cycle_id: cycle.id,
    amount: input.amount,
    note: input.note,
    received_on: input.receivedOn,
    source,
    idempotency_key: idempotencyKey,
  });
  if (!error) return { created: true };
  if (error.code === "23505") return { created: false };
  // the account was deleted after the cycle was read (16 Nov: 500 while «ลบข้อมูลของฉัน»)
  if (error.code === "23503") throw new HttpError(409, "no_cycle", "ยังไม่ได้ตั้งรอบเงิน ตั้งค่าก่อนเริ่มใช้");
  throw error;
}
