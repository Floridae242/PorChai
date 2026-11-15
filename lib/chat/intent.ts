import { isQuestion } from "@/lib/advice/question";

export function referencesPrevious(message: string): boolean {
  return /เมื่อกี้|อันเดิม|อันนั้น|รายการเดิม|เหมือนเดิม|เท่าเดิม|\b(?:that|same|previous)\b/iu.test(message);
}

// Regressions observed in real model answers: fluent wording can still assume the wrong action.
export function needsIntentClarification(message: string, reply: string): boolean {
  if (!conversationBoundary(message)) return false;
  if (/(?:จด|บันทึก)[^.!?\n]{0,24}(?:เลย|ไว้ก่อน)/u.test(reply)) return true;
  return /โอน|ยืม|คืนเงิน|\b(?:refund|transfer|split)\b|หาร\s*\d|คนละ/iu.test(message) &&
    !/ไหม|หรือ|อะไร|แบบไหน|\?|whether/iu.test(reply);
}

// High-confidence boundaries for side effects, not an attempt to replace the LLM's language skills.
// Anything matching these still reaches conversational AI, but cannot create an expense/pending payment.
export function conversationBoundary(message: string): string | null {
  const text = message.normalize("NFKC").trim();
  if (/ไม่(?:ได้|ต้อง|เอา|ซื้อ|จด|บันทึก)|อย่า(?:เพิ่ง)?(?:จด|บันทึก)|ยกเลิก|ช่างมัน|\b(?:cancel|never\s*mind|didn['’]?t|haven['’]?t|not\s+(?:buy|paid|pay))\b/iu.test(text)) {
    return "ข้อความนี้ยังไม่ถูกบันทึกครับ ถ้าต้องการจดรายการใหม่ ส่งชื่อรายการกับยอดที่จ่ายจริงได้เลยครับ";
  }
  if (/โอน|ยืม|คืนเงิน|โอนคืน|\b(?:refund|transfer|split)\b|หาร\s*\d|คนละ|แชร์ค่า/iu.test(text)) {
    return "ยอดนี้เป็นรายจ่ายของคุณ รายรับ หรือโอนระหว่างบัญชีครับ? ถ้าแบ่งกับเพื่อน ขอเฉพาะยอดที่คุณจ่ายเองครับ";
  }
  if (/ไม่สิ|ไม่ใช่|แก้เป็น|ขอเช็กก่อน|\b(?:actually|instead)\b/iu.test(text)) {
    return "ต้องการแก้รายการเดิมหรือจดรายการใหม่ครับ? ขอชื่อรายการกับยอดที่ยืนยันแล้วก่อนครับ";
  }
  if (referencesPrevious(text)) {
    return "หมายถึงรายการไหนที่คุยไว้ครับ? ต้องการจดรายจ่ายที่เกิดขึ้นแล้ว แก้รายการเดิม หรือลองก่อนจ่ายครับ?";
  }
  if (/เบอร์|รหัส|อายุ|(?:^|\s)ปี\s*\d|\b(?:phone|code|age|year)\b/iu.test(text)) {
    return "ตัวเลขนี้เป็นยอดเงินที่จ่ายจริงหรือข้อมูลอย่างอื่นครับ? ถ้าจะจดรายจ่าย ส่งชื่อรายการกับยอดได้เลยครับ";
  }
  if (/^(?:พรุ่งนี้|มะรืน|จะซื้อ|จะกิน|เดี๋ยวซื้อ)|\btomorrow\b/iu.test(text) && !isQuestion(text)) {
    return "กำลังวางแผนซื้อใช่ไหมครับ? ส่งชื่อรายการ ราคา และวันที่ต้องการลองก่อนจ่ายได้ครับ ยังไม่บันทึกรายจ่ายครับ";
  }
  if (/แกล้ง|สมมติว่าจด|บอกว่าจด|เพิ่มเงินให้|\bpretend\b/iu.test(text)) {
    return "ผมช่วยดูแผนและจดตามการยืนยันจริงได้ครับ ต้องการลองก่อนจ่ายหรือจดรายจ่ายที่เกิดขึ้นแล้วครับ?";
  }
  return null;
}
