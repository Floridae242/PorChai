import { normalizeMoneyText } from "@/lib/advice/question";
import { MAX_AMOUNT } from "@/lib/chat/parse";
import { HttpError } from "@/lib/http";

export interface InstallmentInput {
  title: string;
  total: number;
  count: number;
  firstDue: string;
}
export interface InstallmentDue {
  title: string;
  amount: number;
  dueOn: string;
}
export const INSTALLMENT_HELP =
  "พิมพ์ เช่น ผ่อน โทรศัพท์ ยอดรวม 12000 บาท 12 งวด เริ่ม 2026-12-01 หรือระบุ งวดละ 1000 บาท 12 งวด พร้อมวันเริ่มครับ\nยอดรวมต้องเป็นยอดผ่อนคงเหลือที่ต้องจ่ายจริง รวมดอกเบี้ยและค่าธรรมเนียมแล้ว ไม่รวมเงินดาวน์ที่จ่ายไปแล้ว ระบบยังไม่คำนวณดอกเบี้ยหรือเงินดาวน์ให้ครับ";
const invalid = (message: string): never => {
  throw new HttpError(422, "invalid_installment", message);
};
function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const stamp = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(stamp.getTime()) &&
    stamp.toISOString().slice(0, 10) === value
  );
}
export function installmentSchedule(
  input: InstallmentInput,
  today: string,
): InstallmentDue[] {
  if (
    !input ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.trim().length > 40
  )
    invalid("ชื่อสินค้าต้องยาว 1–40 ตัวอักษรครับ");
  if (
    !Number.isSafeInteger(input.total) ||
    input.total <= 0 ||
    input.total > MAX_AMOUNT
  )
    invalid("ยอดผ่อนรวมต้องมากกว่า 0 และไม่เกิน 100,000 บาทครับ");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 60)
    invalid("จำนวนงวดต้องเป็นจำนวนเต็ม 1–60 งวดครับ");
  if (input.total < input.count) invalid("แต่ละงวดต้องไม่น้อยกว่า 1 สตางค์ครับ");
  if (
    !validDay(input.firstDue) ||
    input.firstDue < today ||
    input.firstDue > "2090-12-31"
  )
    invalid("วันเริ่มต้องเป็นวันที่จริง ตั้งแต่วันนี้ถึง 2090-12-31 ครับ");
  const [year, month, day] = input.firstDue.split("-").map(Number);
  return Array.from({ length: input.count }, (_, i) => {
    const start = new Date(Date.UTC(year, month - 1 + i, 1)),
      end = new Date(Date.UTC(year, month + i, 0));
    start.setUTCDate(Math.min(day, end.getUTCDate()));
    return {
      title: `${input.title.trim()} · งวด ${i + 1}/${input.count}`,
      amount:
        Math.floor(input.total / input.count) +
        (i < input.total % input.count ? 1 : 0),
      dueOn: start.toISOString().slice(0, 10),
    };
  });
}

// Literal, bounded grammar. Never send an ambiguous installment message to the ordinary expense parser.
export function parseInstallment(
  message: string,
  today: string,
): InstallmentInput {
  if (message.length > 500) invalid("คำสั่งผ่อนยาวเกินไปครับ กรุณาระบุเฉพาะชื่อ ยอดรวม จำนวนงวด และวันเริ่ม");
  const s = normalizeMoneyText(message)
    .replace(/(?:ครับ|ค่ะ)\s*$/u, "")
    .trim();
  if (/ดาวน์|ดอกเบี้ย|ค่าธรรมเนียม|%|ประมาณ|ราว|เกือบ|หรือ|สัปดาห์|รายวัน|ต่อวัน/u.test(s))
    invalid(INSTALLMENT_HELP);
  const match =
    /^(?:เพิ่ม|จด|บันทึก)?(?:แผน)?ผ่อน\s+(.+?)\s+(ยอดรวม|งวดละ)\s+([\d.]+)\s*(?:บาท)?\s+([\d.]+)\s*งวด\s+(?:เริ่ม|งวดแรก)\s+(\d{4}-\d{2}-\d{2})$/u.exec(
      s,
    );
  if (
    !match ||
    !/^\d+(?:\.\d{1,2})?$/.test(match[3]) ||
    !/^\d+$/.test(match[4])
  )
    invalid(INSTALLMENT_HELP);
  const count = Number(match![4]),
    stated = Math.round(Number(match![3]) * 100);
  const input = {
    title: match![1],
    total: match![2] === "งวดละ" ? stated * count : stated,
    count,
    firstDue: match![5],
  };
  installmentSchedule(input, today);
  return input;
}
