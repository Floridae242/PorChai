import { flexExamples, type FlexExample } from "./flex-examples";
import { buildOnboardingCarousel } from "./onboarding";
import { text } from "./reply";
import { presentReply } from "./presentation";
import type { FlexMessage } from "./branded-flex";
import {
  recordedCard,
  incomeCard,
  todayCard,
  recordedManyCard,
  proposalCard,
  ocrDraftCard,
  reminderCard,
} from "@/lib/chat/cards";
import {
  computeBudget,
  tomorrowBudget,
  type BudgetInput,
} from "@/lib/calc/budget";
import type { Summary } from "@/lib/api-types";

/** Public fictional fixtures, using the same builders as runtime. Exported postbacks are inert. */
export function flexCaseCatalog(): FlexExample[] {
  const input: BudgetInput = {
    balance: 235500,
    spentToday: 4500,
    reserved: 60000,
    savings: 24000,
    emergencyBuffer: 12000,
    essentialPerDay: 7000,
    today: "2026-11-15",
    payday: "2026-11-27",
  };
  const summary = (p: BudgetInput): Summary => ({
    ...p,
    balanceAsOf: "2026-11-15T00:00:00+07:00",
    budget: computeBudget(p),
    basis: "preview-only",
  });
  const id = "550e8400-e29b-41d4-a716-446655440000";
  const add = (
    key: string,
    label: string,
    message: Parameters<typeof presentReply>[0],
    heading?: string,
  ): FlexExample => {
    const card = presentReply(message, heading);
    if (card.type !== "flex") throw Error(`Expected bounded Flex: ${key}`);
    return {
      id: key,
      label,
      description: "ข้อมูลสมมติสำหรับตรวจหน้าตาการ์ด ปุ่มตัวอย่างไม่บันทึกข้อมูลจริง",
      userText: null,
      message: card as FlexMessage,
    };
  };
  const cases: FlexExample[] = [
    {
      ...flexExamples()[0],
      description: "Carousel 10 เรื่อง ชุดเดียวกับตอนเพิ่มเพื่อนและขอวิธีใช้",
      message: buildOnboardingCarousel(),
    },
    ...flexExamples().slice(1),
    add("today-live", "งบวันนี้", todayCard(summary(input))),
    add(
      "record-live",
      "จดในแชต",
      recordedCard(
        { id, title: "ข้าว", amount: 4500, category: "food" },
        summary(input),
        tomorrowBudget(input),
      ),
    ),
    add(
      "record-over",
      "จดเกินงบ",
      recordedCard(
        { id, title: "ชาบู", amount: 35000, category: "food" },
        summary({ ...input, spentToday: 35000, balance: 205000 }),
        tomorrowBudget({ ...input, spentToday: 35000, balance: 205000 }),
      ),
    ),
    add(
      "income-live",
      "รายรับเข้า",
      incomeCard(100000, summary({ ...input, balance: 335500 })),
    ),
    add(
      "many-preview",
      "หลายรายการรอยืนยัน",
      proposalCard(
        [
          { title: "ข้าว", amount: 4500, category: "food" },
          { title: "รถเมล์", amount: 2000, category: "transport" },
        ],
        "preview-only",
        7500,
      ),
    ),
    add(
      "many-saved",
      "จดหลายรายการ",
      recordedManyCard(
        [
          { id, title: "ข้าว", amount: 4500, category: "food" },
          {
            id: `${id.slice(0, -1)}1`,
            title: "รถเมล์",
            amount: 2000,
            category: "transport",
          },
        ],
        summary({ ...input, balance: 233500, spentToday: 6500 }),
        tomorrowBudget({ ...input, balance: 233500, spentToday: 6500 }),
      ),
    ),
    add(
      "ocr-draft",
      "OCR เลือกยอด",
      ocrDraftCard(
        {
          id,
          kind: "expense",
          merchant: "ร้านตัวอย่าง",
          amount: 5000,
          candidates: [5000, 10000],
          date: input.today,
        },
        input.today,
        null,
      ),
    ),
    add(
      "reminder-live",
      "เตือนรายการประจำ",
      reminderCard(
        {
          id,
          label: "ข้าวเที่ยง",
          amount: 5000,
          category: "food",
          day: input.today,
          status: "sent",
          entry_id: null,
        },
        "12:30",
      ),
    ),
  ];
  const routine: [string, string, string, string][] = [
    [
      "setup-chat",
      "เริ่มในแชต",
      "เริ่มรอบเงิน",
      "เงินหลักมาจากไหนครับ? พิมพ์ เงินจากบ้าน/ทุน, งานพิเศษ หรือ อื่นๆ",
    ],
    [
      "missing-amount",
      "ถามยอดเพิ่ม",
      "ขอข้อมูลเพิ่ม",
      "รายการนี้จ่ายกี่บาทครับ? พิมพ์ยอดจริง ยังไม่ได้บันทึกครับ",
    ],
    [
      "ambiguous-transfer",
      "รายรับหรือโอน",
      "ขอความชัดเจน",
      "ยอดนี้เป็นรายจ่ายของคุณ รายรับ หรือโอนระหว่างบัญชีครับ? ยังไม่ได้บันทึก",
    ],
    [
      "ocr-unreadable",
      "รูปอ่านไม่ได้",
      "ตรวจใบเสร็จอีกครั้ง",
      "อ่านยอดในรูปไม่ชัดครับ ส่งรูปใหม่หรือพิมพ์ชื่อรายการกับยอดจริงได้เลย ยังไม่ได้บันทึก",
    ],
    [
      "ocr-own-transfer",
      "โอนบัญชีตัวเอง",
      "ไม่ลงเป็นรายจ่าย",
      "โอนระหว่างบัญชีตัวเอง ไม่นับเป็นรายจ่ายหรือรายรับครับ ไม่ได้จดอะไร",
    ],
    [
      "category-preview",
      "ยืนยันหมวดและงบ",
      "ตรวจข้อมูลก่อนยืนยัน",
      "ยืนยัน เพิ่มหมวด ชานม งบ 500 บาท/เดือน\nยังไม่ได้เปลี่ยนข้อมูล กดยืนยันหรือยกเลิกครับ",
    ],
    [
      "category-saved",
      "บันทึกหมวด",
      "ผลการทำรายการ",
      "บันทึกหมวด ชานม · 500 บาทต่อเดือนแล้วครับ งบนี้ใช้ติดตามรายจ่าย ไม่ได้เพิ่มเงินที่ใช้ได้",
    ],
    [
      "report-day",
      "รายงานรายวัน",
      "รายงานการใช้เงิน",
      "รายงานรายวัน · 15 พ.ย. 2569\nรายรับ 1,000 บาท\nรายจ่าย 65 บาท · 2 รายการ\nรับสุทธิ 935 บาท (ไม่ใช่ยอดคงเหลือ)",
    ],
    [
      "report-empty",
      "รายงานไม่มีข้อมูล",
      "รายงานการใช้เงิน",
      "ยังไม่มีรายการที่จดในช่วงนี้ครับ ไม่ได้หมายความว่าวันนี้ไม่มีรายจ่าย",
    ],
    [
      "insights",
      "วิเคราะห์พฤติกรรม",
      "วิเคราะห์การใช้เงิน",
      "พบรายการข้าวเที่ยง 3 ครั้ง ใน 3 วันที่จด\nลองทบทวนว่าควรตั้งงบแยกหรือไม่ วันที่ไม่มีรายการอาจเป็นการจดตกหล่น\nAI เสนอได้ แต่ไม่เปลี่ยนงบให้เอง",
    ],
    [
      "search-found",
      "ค้นพบรายการ",
      "ค้นรายจ่าย",
      "พบ 2 รายการที่มีคำว่า “ข้าว” รวม 100 บาท ในเดือนนี้\nแสดงเฉพาะบัญชีของคุณ",
    ],
    [
      "search-empty",
      "ค้นไม่พบ",
      "ค้นรายจ่าย",
      "พบ 0 รายการที่มีคำว่า “ข้าว” ในช่วงนี้ ลองเปลี่ยนคำค้นหรือช่วงเวลาครับ ไม่ได้บันทึกรายจ่าย",
    ],
    [
      "web-handoff",
      "ค้นเว็บพร้อมแหล่งอ้างอิง",
      "ค้นเว็บพร้อมอ้างอิง",
      "ค้นเว็บต้องแสดงแหล่งอ้างอิงและส่วนค้นหาของผู้ให้บริการ จึงเปิดในหน้าค้นหาครับ ส่วนค้นรายจ่ายทำในแชตได้",
    ],
    [
      "points-auto",
      "แต้มอัตโนมัติ",
      "แต้มของฉัน",
      "คุณมี 1 แต้ม · วันนี้รับแต้มแล้ว\nจดรายรับหรือรายจ่ายวันนี้สำเร็จ ได้วันละ 1 แต้ม กดซ้ำหรือจดหลายรายการไม่เพิ่มซ้ำ",
    ],
    [
      "points-already",
      "รับแต้มซ้ำ",
      "เช็กแผนและแต้ม",
      "รับแต้มวันนี้ไปแล้ว · มี 1 แต้มครับ ไม่ได้เพิ่มแต้มซ้ำ",
    ],
    [
      "reward-empty",
      "ยังไม่มีรางวัล",
      "ของรางวัล",
      "ยังไม่มีของรางวัลที่เปิดให้แลกครับ แต้มของคุณยังอยู่ตามยอดเดิม",
    ],
    [
      "reward-insufficient",
      "แต้มไม่พอ",
      "ตรวจคำขออีกครั้ง",
      "แต้มยังไม่พอสำหรับของรางวัลนี้ครับ ยังไม่ได้หักแต้ม",
    ],
    [
      "reward-stock",
      "รางวัลหมด",
      "ตรวจคำขออีกครั้ง",
      "ของรางวัลหมดแล้วครับ เลือกรายการใหม่ได้ ยังไม่ได้หักแต้ม",
    ],
    [
      "notify-preview",
      "เปิดแจ้งเตือน",
      "ตรวจข้อมูลก่อนยืนยัน",
      "ยืนยัน เปิดสรุปรายวัน เวลา 20:00\nยังไม่ได้เปลี่ยนข้อมูล คุณเลือกเปิดหรือปิดได้เอง",
    ],
    [
      "notify-off",
      "ปิดแจ้งเตือน",
      "ผลการทำรายการ",
      "บันทึกปิดสรุปรายวัน/เดือนและเตือนงบแล้วครับ การเตือนจดเป็นอีกการตั้งค่า ใช้ ปิดเตือนจด ได้",
    ],
    [
      "installment-preview",
      "สร้างงวดผ่อน",
      "ตรวจข้อมูลก่อนยืนยัน",
      "ยืนยัน สร้างบิลผ่อน โทรศัพท์ 12 งวด รวม 12,000 บาท\nเดือนละ 1,000 บาท ยอดนี้รวมต้นทุนที่คุณระบุแล้ว ยังไม่ลงรายจ่ายหรือชำระให้ร้านอัตโนมัติ",
    ],
    [
      "installment-invalid",
      "ผ่อนข้อมูลไม่ครบ",
      "ตรวจคำขออีกครั้ง",
      "ระบุชื่อสินค้า ยอดผ่อนรวมที่ต้องจ่ายจริง จำนวนงวด และวันเริ่มครับ ไม่เดาดอกเบี้ยหรือเงินดาวน์ ยังไม่ได้สร้างบิล",
    ],
    [
      "adjust-balance",
      "ปรับยอดเงินจริง",
      "ผลการทำรายการ",
      "ปรับยอดเงินจริงเป็น 2,000 บาทแล้ว ไม่ได้สร้างรายจ่ายชดเชยครับ",
    ],
    ["cancelled", "ยกเลิกคำขอ", "ยกเลิกคำขอ", "ยกเลิกคำขอแล้วครับ ไม่ได้เปลี่ยนข้อมูล"],
    [
      "stale",
      "ข้อมูลเปลี่ยนระหว่างยืนยัน",
      "ตรวจคำขออีกครั้ง",
      "ข้อมูลเปลี่ยนไปแล้วครับ พิมพ์คำสั่งใหม่เพื่อตรวจยอดก่อนยืนยัน ยังไม่ได้ทำคำขอเก่านี้",
    ],
    [
      "expired",
      "คำขอหมดอายุ",
      "ตรวจคำขออีกครั้ง",
      "คำขอนี้หมดอายุหรือไม่ใช่ของบัญชีนี้แล้วครับ พิมพ์คำสั่งใหม่ได้เลย",
    ],
    ["already-done", "กดยืนยันซ้ำ", "คำขอที่ทำแล้ว", "คำขอนี้จบแล้วครับ ไม่ได้ทำซ้ำ"],
    [
      "promo-demo",
      "โปรและคูปองจำลอง",
      "โปรตัวอย่าง",
      "คูปองและโปรจำลอง ใช้ซื้อจริงไม่ได้ครับ\nร้านสมมติ · คูปองตัวอย่าง 49 บาท · DEMO-MEAL49\nตรวจเงื่อนไขในหน้าโปรตัวอย่าง",
    ],
    [
      "ai-unavailable",
      "AI ไม่มีคำอธิบายเพิ่ม",
      "วิเคราะห์จากรายการที่จด",
      "ยังไม่มีคำอธิบาย AI เพิ่มเติม ดูข้อสังเกตจากรายการที่จดได้ตามปกติ ไม่มีการเปลี่ยนงบหรือบันทึกข้อมูลจาก AI",
    ],
  ];
  for (const [key, label, heading, body] of routine)
    cases.push(add(key, label, text(body), heading));
  return cases.map((c) => ({
    ...c,
    message: inert(c.message, c.id) as FlexMessage,
  }));
}
function inert(value: unknown, id: string): unknown {
  if (Array.isArray(value)) return value.map((v) => inert(v, id));
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.type === "postback")
      return {
        ...v,
        data: `preview:${id}`,
        displayText: `ตัวอย่าง ${String(v.label ?? id)}`,
      };
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, inert(x, id)]),
    );
  }
  return value;
}
