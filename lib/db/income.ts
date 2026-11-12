import { requireActiveCycle } from "@/lib/db/budget";
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
  throw error;
}
