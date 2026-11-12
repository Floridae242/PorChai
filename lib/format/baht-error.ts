import type { ParseBahtResult } from "./money";

type Reason = Extract<ParseBahtResult, { ok: false }>["reason"];

const MESSAGES: Record<Reason, string> = {
  empty: "กรุณากรอกจำนวนเงิน",
  not_number: "ใส่เป็นตัวเลขเท่านั้น เช่น 400 หรือ 1,250.50",
  not_positive: "ใส่จำนวนเงินมากกว่า 0",
  too_many_decimals: "ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง",
  too_large: "จำนวนเงินมากเกินไป",
};

// Thai message for each parseBahtInput failure reason (shown under the field).
export function bahtErrorMessage(reason: Reason): string {
  return MESSAGES[reason];
}
