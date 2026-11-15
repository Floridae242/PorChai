import { addDays } from "@/lib/calc/time";
import { normalizeMoneyText } from "@/lib/advice/question";
import { MAX_AMOUNT } from "@/lib/chat/parse";
import type { Intent, Tool } from "./types";

export function statedMoney(message: string): number | undefined {
  const source = normalizeMoneyText(message)
    .replace(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/gu, " ")
    .replace(/(?:รายการ|แผน|บิล|ลำดับ|วันที่)\s*\d+/gu, " ");
  if (/ประมาณ|ราว|เกือบ|กว่า|\d\s*-\s*\d|\d[eE][+-]?\d/u.test(source))
    return undefined;
  const numbers = source.match(/[+-]?\d+(?:\.\d+)?/g) ?? [];
  if (numbers.length !== 1 || !/^\d+(?:\.\d{1,2})?$/.test(numbers[0]))
    return undefined;
  const amount = Math.round(Number(numbers[0]) * 100);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT
    ? amount
    : undefined;
}
export function statedDate(message: string, today: string): string | undefined {
  const iso = message.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  if (/มะรืน/u.test(message)) return addDays(today, 2);
  if (/พรุ่งนี้/u.test(message)) return addDays(today, 1);
  if (/เมื่อวาน/u.test(message)) return addDays(today, -1);
  if (/วันนี้/u.test(message)) return today;
  return undefined;
}
function namedMoney(text: string, names: string): number | undefined {
  const match = normalizeMoneyText(text).match(
    new RegExp(`(?:${names})(?:ต่อวัน|วันละ)?\\s*(\\d+(?:\\.\\d+)?)`),
  );
  return match ? statedMoney(match[1]) : undefined;
}
export function fields(message: string, tool: Tool, today: string): Intent {
  const normalized = normalizeMoneyText(message),
    time = normalized.match(/(?:^|\s|เวลา)([0-2]?\d:[0-5]\d)(?:\s|$)/)?.[1];
  // «อาทิตย์» alone is Sunday: only «อาทิตย์นี้ / ที่แล้ว» is a week
  const period = /สัปดาห์|อาทิตย์(?:นี้|ที่แล้ว)/u.test(message)
    ? "week"
    : /เมื่อวาน|วันนี้|รายวัน/u.test(message)
    ? "day"
    : /ย้อนหลัง.*ปี/u.test(message)
      ? "year"
      : "month";
  const date = /เดือนที่แล้ว/u.test(message)
    ? addDays(`${today.slice(0, 7)}-01`, -1)
    : /(?:สัปดาห์|อาทิตย์)ที่แล้ว/u.test(message)
    ? addDays(today, -7)
    : statedDate(message, today);
  const target = /ล่าสุด/u.test(message)
    ? "latest"
    : Number(normalized.match(/(?:รายการ|แผน|บิล|ลำดับ)\s*(\d+)/u)?.[1]) ||
      undefined;
  return {
    tool,
    amount: statedMoney(message),
    date,
    period,
    target,
    page: /หน้า\s*(\d+)/u.test(normalized)
      ? Number(normalized.match(/หน้า\s*(\d+)/u)![1])
      : undefined,
    time: time?.padStart(5, "0"),
    food: namedMoney(message, "ค่ากิน|ค่าอาหาร|อาหาร"),
    transport: namedMoney(message, "ค่าเดินทาง|ค่ารถ"),
    enabled: /^(?:ช่วย)?\s*เปิด/u.test(message)
      ? true
      : /^(?:ช่วย)?\s*ปิด/u.test(message)
        ? false
        : undefined,
    notification: /รายวัน/u.test(message)
      ? "daily"
      : /รายเดือน/u.test(message)
        ? "monthly"
        : /งบ/u.test(message)
          ? "budget"
          : "all",
  };
}
export function parseIntent(message: string, today: string): Intent | null {
  const s = message
      .trim()
      .replace(/^(?:ช่วย(?!เหลือ)|ขอให้|ขอ(?=ดู)|อยากให้|อยาก)\s*/u, ""),
    bare = s.replace(/(?:ครับ|ค่ะ|นะครับ|หน่อย)+$/u, "").trim();
  if(/^(?:ดู|ขอ)?(?:วิเคราะห์|พฤติกรรม|แพทเทิร์น)|^AI\s*(?:แนะนำ|วิเคราะห์)|^แนะนำงบ/iu.test(s))return {tool:"insights",query:s};
  if(/^(?:ดู|ขอ)(?:หมวด|งบรายหมวด)/u.test(s))return {tool:"categories"};
  if(/^(?:เพิ่มหมวด|ตั้งหมวด|ตั้งงบ)/u.test(s))return {tool:"category_save",query:bare};
  if(/\sหมวด\s/u.test(s))return {tool:"category_entry",query:bare};
  if(/^(?:ดู|ขอ)?(?:ภาพรวม|สรุปการใช้เงิน|สรุปค่าใช้จ่าย|สรุป)$/u.test(bare))return {...fields(s,"report",today),period:"month"};
  if (/ผ่อน|งวด/u.test(s)) return { tool: "installments", query: s };
  if (/^(เมนู|ช่วยเหลือ|ทำอะไรได้บ้าง|คำสั่ง|ใช้ยังไง|ใช้อย่างไร)$/u.test(bare))
    return { tool: "help" };
  if (/^(?:เริ่ม|ตั้ง)(?:แผน|รอบเงิน)|^เริ่มรอบใหม่/u.test(s)) return { tool: "setup" };
  if (
    /^(?:ดู|ขอ)?(?:รายงาน|สรุป(?:รายวัน|รายเดือน|วันนี้|เดือน))|(?:เดือนนี้|เดือนที่แล้ว|สัปดาห์นี้|สัปดาห์ที่แล้ว|อาทิตย์นี้|อาทิตย์ที่แล้ว|เมื่อวาน).*ใช้(?:เงิน)?ไป(?:เท่า|กี่)/u.test(
      s,
    )
  )
    return fields(s, "report", today);
  if (/^ค้นรายจ่าย|^ค้น(?:หา)?(?:รายการ|รายจ่าย)/u.test(s))
    return {
      ...fields(s, "search", today),
      query: s
        .replace(/^ค้นรายจ่าย|^ค้น(?:หา)?(?:รายการ|รายจ่าย)/u, "")
        .replace(/วันนี้|เดือนนี้|ย้อนหลัง\s*1\s*ปี/gu, "")
        .trim(),
    };
  if (/^ค้นเว็บ|^search\b/iu.test(s))
    return {
      ...fields(s, "web", today),
      query: s.replace(/^ค้นเว็บ|^search\b/iu, "").trim(),
    };
  if (/^(?:ดู|ขอ)?(?:รายรับ)?แต้ม$|^ดูคะแนน/u.test(bare)) return { tool: "points" };
  if (/^(?:รับแต้ม|เช็กครบแล้ว|เช็คครบแล้ว)$/u.test(bare))
    return { tool: "claim_points" };
  if (/^(?:ดู|ขอ|แลก)(?:ของรางวัล|รางวัล|ของ)|^แลกแต้ม/u.test(s))
    return {
      tool: "rewards",
      query: s
        .replace(/^(?:ดู|ขอ|แลก)(?:ของรางวัล|รางวัล|ของ)|^แลกแต้ม/u, "")
        .trim(),
    };
  if (/^ดู\s*(?:คูปอง|โปรโมชัน|โปรโมชั่?น|โปร|โฆษณา)(?:ตัวอย่าง|จำลอง)?$/u.test(bare))
    return { tool: "promos" };
  if (
    /^(?:เปิด|ปิด|ดู|ตั้ง(?:ค่า)?|เปลี่ยนเวลา)(?:สรุป|แจ้งเตือน|เตือนงบ)|^ตั้งเวลาแจ้งเตือน/u.test(
      s,
    )
  )
    return fields(s, "notifications", today);
  if (/^(?:เปิด|ปิด|ดู|ตั้ง(?:ค่า)?)(?:การเตือนจด|เตือนจด|เตือนรายการ)/u.test(s))
    return fields(s, "reminders", today);
  if (/^ปรับยอด|^แก้ยอดเงิน|^ยอดเงินจริง/u.test(s))
    return fields(s, "balance", today);
  if (/^(?:ตั้ง|ปรับ|กัน|เปลี่ยน)(?:ค่า)?เงินเผื่อ/u.test(s))
    return fields(s, "buffer", today);
  if (/^(?:เปลี่ยน|ตั้ง)(?:วันรับเงิน|วันเงินเข้า)/u.test(s))
    return fields(s, "payday", today);
  if (/^(?:ตั้ง|ปรับ|เปลี่ยน)(?:ค่า)?(?:กิน|อาหาร)|^ตั้งค่ารถ/u.test(s))
    return fields(s, "essentials", today);
  if (/^(?:ดู|ขอ)(?:รายการ|รายจ่าย)|^รายการล่าสุด/u.test(s))
    return fields(s, "entries", today);
  if (/^(?:แก้|เปลี่ยนยอด)(?:รายการ|รายจ่าย)/u.test(s))
    return fields(s, "entry_edit", today);
  if (/^(?:ลบ|ยกเลิก)(?:รายการ|รายจ่าย)/u.test(s))
    return fields(s, "entry_delete", today);
  if (/^(?:ดู|ขอ)(?:แผน|บิล)|^บิลค้าง/u.test(s)) return fields(s, "plans", today);
  const add = s.match(/^(?:เพิ่ม|จด|บันทึก)(บิล|แผน)\s*(.*)$/u);
  if (add) {
    const f = fields(s, add[1] === "บิล" ? "add_bill" : "add_plan", today);
    const title = add[2]
      .replace(/\d{4}-\d{2}-\d{2}/gu, " ")
      .replace(/[๐-๙\d,]+(?:\.\d+)?\s*(?:บาท|฿)?/gu, " ")
      .replace(/ครบกำหนด|วันที่|พรุ่งนี้|วันนี้|มะรืน/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { ...f, title: title || undefined };
  }
  const plan = s.match(/^(ยกเลิกการจ่าย|จ่าย|ยกเลิก|เลื่อน|เก็บ)(?:บิล|แผน)/u);
  if (plan)
    return {
      ...fields(s, "plan_action", today),
      action:
        plan[1] === "ยกเลิกการจ่าย"
          ? "unpay"
          : plan[1] === "จ่าย"
            ? "pay"
            : plan[1] === "ยกเลิก"
              ? "cancel"
              : plan[1] === "เลื่อน"
                ? "postpone"
                : "keep",
    };
  return null;
}
