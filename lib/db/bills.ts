import { thaiDate } from "@/lib/calc/time";
import { parseBillSchedule } from "@/lib/bills/calendar";
import type { BillSchedule } from "@/lib/bills/types";
import { HttpError } from "@/lib/http";
import { getDb } from "./client";
type Row = {
  id: string;
  title: string;
  amount: number;
  starts_on: string;
  repeat: BillSchedule["repeat"];
  notify: boolean;
  enabled: boolean;
};
const map = (r: Row): BillSchedule => ({
  id: r.id,
  title: r.title,
  amount: r.amount,
  startsOn: r.starts_on,
  repeat: r.repeat,
  notify: r.notify,
  enabled: r.enabled,
});
const columns = "id,title,amount,starts_on,repeat,notify,enabled";
function fail(error: { code: string } | null) {
  if (!error) return;
  if (error.code.startsWith("BL"))
    throw new HttpError(
      Number(error.code.slice(2)),
      error.code === "BL409" ? "no_cycle" : "invalid_bill",
      "ไม่สามารถบันทึกบิลได้ ตรวจรอบเงิน วันที่ และจำนวนบิล (ไม่เกิน 50 บิล) ครับ",
    );
  throw error;
}
export async function listBillSchedules(
  userId: string,
): Promise<BillSchedule[]> {
  const { data, error } = await getDb()
    .from("bill_schedules")
    .select(columns)
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("starts_on")
    .limit(50);
  if (error) throw error;
  return (data as Row[]).map(map);
}
export async function createBillSchedule(
  userId: string,
  input: unknown,
  key: string,
  now = new Date(),
): Promise<BillSchedule> {
  const today = thaiDate(now);
  // An accepted request can be replayed after Thai midnight. Validate structure first,
  // then look up the account-owned key before rejecting its now-past start date.
  parseBillSchedule(input, today, true);
  const seen = await getDb()
    .from("bill_schedules")
    .select(columns)
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (seen.error) throw seen.error;
  if (seen.data) return map(seen.data as Row);
  const p = parseBillSchedule(input, today);
  const { data, error } = await getDb().rpc("create_bill_schedule", {
    p_user: userId,
    p_title: p.title,
    p_amount: p.amount,
    p_start: p.startsOn,
    p_repeat: p.repeat,
    p_notify: p.notify,
    p_key: key,
    p_today: today,
  });
  fail(error);
  return map(data as Row);
}
export async function updateBillSchedule(
  userId: string,
  id: string,
  input: unknown,
  now = new Date(),
): Promise<BillSchedule> {
  const v = input as { notify?: unknown; stop?: unknown } | null;
  if (
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) ||
    !v ||
    Array.isArray(v) ||
    (v.notify === undefined && v.stop !== true) ||
    (v.notify !== undefined && typeof v.notify !== "boolean") ||
    (v.stop !== undefined && v.stop !== true)
  )
    throw new HttpError(
      422,
      "invalid_input",
      "เลือกเปิด/ปิดการเตือนหรือหยุดบิลให้ถูกต้องครับ",
    );
  const { data, error } = await getDb().rpc("update_bill_schedule", {
    p_user: userId,
    p_id: id,
    p_notify: v.notify ?? null,
    p_stop: v.stop === true,
    p_today: thaiDate(now),
  });
  fail(error);
  return map(data as Row);
}
