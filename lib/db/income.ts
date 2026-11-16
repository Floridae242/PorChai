import { requireActiveCycle, requireInCycle } from "@/lib/db/budget";
import { HttpError } from "@/lib/http";
import { getDb } from "@/lib/db/client";
import type { NewIncome } from "@/lib/validate";

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
