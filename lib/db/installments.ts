import { getDb } from "./client";
import { loadBudget, requireBasis } from "./budget";
import {
  installmentSchedule,
  type InstallmentInput,
} from "@/lib/chat/actions/installments";
import { HttpError } from "@/lib/http";
import { thaiDate } from "@/lib/calc/time";

// All installments commit together. Repeating the same key also works after a payment or cycle rollover.
export async function addInstallments(
  userId: string,
  input: InstallmentInput,
  key: string,
  basis: string,
  now = new Date(),
): Promise<void> {
  const today = thaiDate(now);
  if (!/^[a-zA-Z0-9:-]{1,100}$/.test(key))
    throw new HttpError(422, "invalid_input", "รหัสคำขอไม่ถูกต้องครับ");
  const loaded = await loadBudget(userId, now);
  // Retry after a committed transaction must reach the RPC's idempotency check, even if basis moved.
  const seen = await getDb()
    .from("plans")
    .select("id")
    .eq("user_id", userId)
    .eq("idempotency_key", `installment:${key}:1`)
    .maybeSingle();
  if (seen.error) throw seen.error;
  installmentSchedule(input, seen.data ? input.firstDue : today);
  if (!seen.data) requireBasis(loaded, basis);
  const { error } = await getDb().rpc("add_installments", {
    p_user: userId,
    p_cycle: loaded.cycle.id,
    p_title: input.title.trim(),
    p_total: input.total,
    p_count: input.count,
    p_first: input.firstDue,
    p_key: key,
  });
  if (error?.code === "IN409")
    throw new HttpError(
      409,
      "stale",
      "รอบเงินหรือคำขอผ่อนเปลี่ยนไปแล้วครับ เริ่มคำสั่งใหม่ก่อนยืนยัน",
    );
  if (error?.code === "IN422")
    throw new HttpError(422, "invalid_installment", "ข้อมูลการผ่อนไม่ถูกต้องครับ");
  if (error) throw error;
}
