import { amountOnly } from "./parse";

/** Short amount answers are only consumed when a stored edit identifies the entry. */
export function editReplyAmount(message: string): number | null {
  const answer = message.trim()
    .replace(/(?:นะครับ|นะคะ|ครับ|ค่ะ|คะ)$/u, "").trim()
    .replace(/^(?:ใช่(?:ครับ|ค่ะ|คะ)?|แก้(?:ยอด)?เป็น|เปลี่ยนเป็น|ยอดใหม่(?:คือ)?|เป็น)\s*/u, "");
  return amountOnly(answer);
}

/** A failed correction/confirmation must never fall through to expense recording. */
export function isCorrectionReply(message: string): boolean {
  const source = message.trim();
  return /^(?:(?:ช่วย|ขอ|อยาก|ต้องการ)(?:ให้)?\s*)?(?:แก้(?!ว)|เปลี่ยนยอด|เปลี่ยนจำนวนเงิน|ปรับยอด|ใช่|ไม่ใช่|ยืนยัน|ตกลง)/u.test(source) ||
    /^(?:เปลี่ยนเป็น|ยอดใหม่|เป็น(?=\s|[๐-๙\d฿+-]))/u.test(source);
}

/** Numeric-looking invalid answers cannot be interpreted as a new expense title. */
export function looksLikeAmountReply(message: string): boolean {
  return /^(?:[๐-๙\d฿$+\-.~−–—]|NaN\b|Infinity\b|(?:ประมาณ|ราว|เกือบ)\s*[๐-๙\d])/iu.test(message.trim());
}
