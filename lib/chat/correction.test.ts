import { describe, expect, it } from "vitest";
import { editReplyAmount, isCorrectionReply, looksLikeAmountReply } from "./correction";

describe("short replies to an owned entry edit", () => {
  it.each(["400", "ใช่ 400", "ใช่ครับ 400 บาท", "ใช่ค่ะ ๔๐๐ บาท", "ใช่ ๔๐๐ บาทครับ", "แก้เป็น 400", "เปลี่ยนเป็น 400 บาท", "ยอดใหม่คือ 400", "เป็น400ค่ะ"])("reads only the stated amount: %s", message => {
    expect(editReplyAmount(message)).toBe(40000);
  });
  it.each(["ข้าว 400", "ใช่ -400", "ใช่ 0", "ใช่ 400 หรือ 500", "ใช่ 4e2", "ใช่ 400.001", "ใช่ประมาณ 400", "ใช่ 100001", "แก้ยอดล่าสุด 400"])("never guesses an amount: %s", message => {
    expect(editReplyAmount(message)).toBeNull();
  });
  it.each(["ใช่ 400", "แก้ยอดล่าสุด400", "ขอแก้ข้าว 400", "ไม่ใช่ 400", "ตกลง 400", "ยืนยัน 400", "เปลี่ยนเป็น400", "ยอดใหม่400", "ยอดใหม่คือ400", "เป็น 400 บาท"])("blocks correction wording from new-expense fallback: %s", message => {
    expect(isCorrectionReply(message)).toBe(true);
  });
  it.each(["ข้าว 400", "ค่าซ่อมเสื้อ 100", "ได้รับเงิน 1000", "น้ำส้ม 30", "แก้วน้ำ 50 บาท", "แก้วกาแฟ 100"])("preserves ordinary records: %s", message => {
    expect(isCorrectionReply(message)).toBe(false);
  });
  it.each([
    ["0.01", 1], ["1,000.50 บาท", 100050], ["๑,๐๐๐.๕๐", 100050],
    ["100,000", 10000000], ["100,000.01", null], ["-0.01", null],
    ["0", null], ["NaN", null], ["Infinity", null], ["1e4", null],
  ])("validates satang boundaries: %s", (message, amount) => {
    expect(editReplyAmount(message)).toBe(amount);
  });
  it.each(["-40", "+40", "−40", "–40", "—40", ".40", "40.001", "$40", "฿-40", "1e4", "NaN", "Infinity", "ประมาณ40", "ราว ๔๐", "เกือบ40"])("keeps malformed amount attempts inside an edit: %s", message => {
    expect(looksLikeAmountReply(message)).toBe(true);
  });
  it.each(["กาแฟ 40", "แก้วน้ำ 50", "ขอวิธีใช้", "received 1000"])("does not mistake ordinary words for numeric replies: %s", message => {
    expect(looksLikeAmountReply(message)).toBe(false);
  });
});
