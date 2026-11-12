import { getDb } from "@/lib/db/client";
import { currentAnchor, requireActiveCycle } from "@/lib/db/budget";
import { HttpError } from "@/lib/http";
import type { BalanceCheck } from "@/lib/validate";

// "ปรับยอด": store the real balance as the new anchor. No entry is created, so no spend
// the user never made appears in their history.
export async function recordBalanceCheck(userId: string, check: BalanceCheck): Promise<void> {
  const cycle = await requireActiveCycle(userId);
  if (check.asOf) {
    const anchor = await currentAnchor(cycle);
    if (check.asOf < anchor.asOf) {
      throw new HttpError(422, "invalid_input", "เวลาของยอดเก่ากว่ายอดที่บันทึกไว้ล่าสุด");
    }
  }
  const { error } = await getDb()
    .from("balance_checks")
    .insert({
      user_id: userId,
      cycle_id: cycle.id,
      balance: check.balance,
      // Omitted = database now(), the same clock as entries.created_at
      ...(check.asOf && { as_of: check.asOf.toISOString() }),
    });
  if (error) throw error;
}
