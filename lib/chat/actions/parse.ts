import { addDays } from "@/lib/calc/time";
import { normalizeMoneyText } from "@/lib/advice/question";
import { MAX_AMOUNT } from "@/lib/chat/parse";
import type { Intent, Tool } from "./types";
import { invalid } from "@/lib/validate";

export function statedMoney(message: string): number | undefined {
  const source = normalizeMoneyText(message)
    .replace(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/gu, " ")
    .replace(/(?:รายการ|แผน|บิล|ลำดับ)\s*\d+/gu, " ")
    .replace(/วันที่\s*\d{1,2}(?!\d)(?!\s*บาท)/gu, " ");
  if (/[+\-−–—]\s*(?:฿\s*)?\d|ประมาณ|ราว|เกือบ|กว่า|\d[eE][+-]?\d/u.test(source))
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
  if (iso) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso)
      throw invalid("น้องพอใช้หาวันที่นี้ในปฏิทินไม่เจอครับ ลองตรวจวัน เดือน และปี เช่น 2026-12-01 โดยใช้ปี ค.ศ.");
    return iso;
  }
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
// «เพิ่มบิล ค่าไฟ 500 วันที่ 20» kept no date (16 Nov): the next 20th from today, today included.
// One-off plans clamp short months; monthly bills keep their requested day as the anchor.
function nextDayOfMonth(message: string, today: string, preserveDay = false): string | undefined {
  const day = Number(normalizeMoneyText(message).match(/วันที่\s*(\d{1,2})(?!\d)/u)?.[1]);
  if (!day || day > 31) return undefined;
  const [y, m] = today.split("-").map(Number);
  const on = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  const thisMonth = on(y, m);
  if (preserveDay) {
    // Keep the requested monthly anchor (31), rather than permanently changing it to 30.
    for (let offset = 0; offset < 12; offset++) {
      const month = new Date(Date.UTC(y, m - 1 + offset, 1));
      const candidate = on(month.getUTCFullYear(), month.getUTCMonth() + 1);
      if (Number(candidate.slice(8)) === day && candidate >= today) return candidate;
    }
    return undefined;
  }
  return thisMonth >= today ? thisMonth : m === 12 ? on(y + 1, 1) : on(y, m + 1);
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
    : statedDate(message, today) ?? (tool === "add_bill" || tool === "add_plan" ? nextDayOfMonth(message, today) : undefined);
  const target = /ล่าสุด|เมื่อกี้/u.test(message)
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
    enabled: /^(?:ช่วย)?\s*(?:เปิด|ตั้งเตือน)/u.test(message)
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
      .normalize("NFC")
      .trim()
      .replace(/^(?:ช่วย(?!เหลือ)|ขอให้|ขอ(?=ดู|แก้|เปลี่ยน)|อยากให้|อยาก|ต้องการ)\s*/u, ""),
    bare = s.replace(/(?:ครับ|ค่ะ|นะครับ|หน่อย)+$/u, "").trim();
  const unpaid = normalizeMoneyText(bare).match(/^(?:ยังไม่(?:ได้)?จ่าย|ไม่ได้จ่าย)\s*(?:บิล|แผน)?\s*(ล่าสุด|เมื่อกี้|\d+)(?:\s*หน้า\s*(\d+))?$/u);
  if (unpaid) return {
    tool: "plan_action", action: "unpay",
    target: /ล่าสุด|เมื่อกี้/u.test(unpaid[1]) ? "latest" : Number(unpaid[1]),
    ...(unpaid[2] ? { page: Number(unpaid[2]) } : {}),
  };
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
  // «ค้นหา ข้าว» too (16 Nov); «ค้นหาเว็บ» is the web
  if (/^ค้นรายจ่าย|^ค้น(?:หา)?(?:รายการ|รายจ่าย)|^ค้นหา(?=\s)/u.test(s))
    return {
      ...fields(s, "search", today),
      query: s
        .replace(/^ค้นรายจ่าย|^ค้น(?:หา)?(?:รายการ|รายจ่าย)|^ค้นหา(?=\s)/u, "")
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
      page: fields(s, "rewards", today).page,
      query: s
        .replace(/^(?:ดู|ขอ|แลก)(?:ของรางวัล|รางวัล|ของ)|^แลกแต้ม/u, "")
        .trim(),
    };
  if (/^ดู\s*(?:คูปอง|โปรโมชัน|โปรโมชั่?น|โปร|โฆษณา)(?:ตัวอย่าง|จำลอง)?$/u.test(bare))
    return { tool: "promos" };
  // A bill-specific reminder is not a request to change every digest preference.
  if (/^(?:ตั้ง(?:ค่า|เวลา)?|เปิด|ปิด|ดู|เปลี่ยน(?:เวลา)?|เลื่อน)(?:การ)?(?:แจ้ง)?เตือน/u.test(s) && /บิล|จ่ายค่า/u.test(s))
    return { tool: "bill_reminder_help" };
  if (
    /^(?:เปิด|ปิด|ดู|ตั้ง(?:ค่า)?|เปลี่ยนเวลา)(?:สรุป|แจ้งเตือน|เตือนงบ)|^ตั้งเวลาแจ้งเตือน/u.test(
      s,
    )
  )
    return fields(s, "notifications", today);
  // «ตั้งเตือน 20:00», «ปิดเตือน» (16 Nov): the reminder to record, the one a student sets most
  if (/^(?:เปิด|ปิด|ดู|ตั้ง(?:ค่า)?)(?:การเตือนจด|เตือนจด|เตือนรายการ)|^(?:เปิด|ปิด|ตั้ง)เตือน(?:\s|\d|$)/u.test(s))
    return fields(s, "reminders", today);
  const balanceEdit = /^แก้ยอดเงิน(?:จริง)?(?:\s|[๐-๙\d]|$)/u.test(s);
  if (/^(?:แก้(?:ไข)?|เปลี่ยนยอด)(?:รายการ|รายจ่าย)/u.test(s) ||
      (!balanceEdit && /^(?:แก้(?:ไข)?(?:ยอด|จำนวนเงิน)|เปลี่ยน(?:ยอด|จำนวนเงิน))/u.test(s)))
    return fields(s, "entry_edit", today);
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
  const add = bare.match(/^(?:เพิ่ม|สร้าง|ตั้ง|จด|บันทึก)\s*(บิล|แผน)\s*(.*)$/u);
  if (add) {
    const f = fields(bare, add[1] === "บิล" ? "add_bill" : "add_plan", today);
    const monthly = add[1] === "บิล" && /ทุก\s*(?:วันที่|เดือน)|รายเดือน|เดือนละ/u.test(add[2]);
    if (monthly) {
      f.repeat = "monthly";
      f.date = statedDate(normalizeMoneyText(bare), today) ?? nextDayOfMonth(bare, today, true);
    }
    // Only normalize digits here: NFKC changes Thai names such as น้ำ.
    const title = add[2].replace(/[๐-๙]/gu, digit => String(digit.charCodeAt(0) - 0x0e50))
      .replace(/\d{4}-\d{2}-\d{2}/gu, " ")
      .replace(/(?:ทุก\s*)?วันที่\s*[๐-๙\d]+(?:\s*ของ(?:ทุก)?เดือน)?/gu, " ")
      .replace(/(?:ของ)?ทุกเดือน|ของเดือน|รายเดือน|เดือนละ/gu, " ")
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
