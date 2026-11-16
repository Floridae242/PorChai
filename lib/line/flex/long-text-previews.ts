import { ONBOARDING_STEPS, onboardingHelp } from "../onboarding";
import { EXTRA_HELP } from "../help-request";
import { miniAppUrl } from "./format";
import { buildConversationCard } from "./cards/conversation";
import type { FlexDemoScenario } from "./index";

// Dev preview only (batch C5): the REAL long chat answers, run through the same wrapper chat replies use
// (presentReply -> buildConversationCard), so the team can see how a long text looks as a card before
// deciding what to shorten. Nothing here is sent to users.
//
// Texts marked "copy" are copied from their source file (those files build the text inside a server-only
// module); the guide texts come straight from onboardingHelp(), so they never drift from what users get.

interface Sample {
  id: string;
  title: string;
  userPrompt: string;
  source: string; // file the text lives in, and whose file it is
  text: string;
}

export type LongTextSample = Sample;

const COPIES: Sample[] = [
  {
    id: "what-can-do",
    title: "ทำอะไรได้บ้าง",
    userPrompt: "ทำอะไรได้",
    source: "lib/chat/actions/index.ts (พอ)",
    text: "ให้น้องพอใช้ช่วยในแชตได้เลยครับ เช่น\n• ได้รับเงิน 1000 บาท / ข้าว 50\n• วันนี้ใช้ได้เท่าไหร่ / ดูรายงานวันนี้ / ดูรายงานเดือนนี้\n• ค้นรายจ่าย ข้าว / ดูรายการ\n• เพิ่มบิล ค่าหอ 500 บาท / ดูแผน / จ่ายบิล 1\n• ผ่อน โทรศัพท์ ยอดรวม 12000 บาท 12 งวด เริ่ม 2026-12-01\n• แก้รายการล่าสุด 60 บาท / ลบรายการล่าสุด\n• ปรับยอด 2000 บาท / กันเงินเผื่อ 100 บาท\n• เปลี่ยนวันรับเงิน 2026-12-01\n• ตั้งค่าอาหาร 50 ค่ารถ 20\n• เปิดสรุปรายวัน เวลา 20:00 / ปิดแจ้งเตือน\n• เปิดเตือนจด / ดูแต้ม / เช็กครบแล้ว / แลกของ\n• เริ่มรอบเงิน / ดูคูปอง\n• ดูภาพรวม / วิเคราะห์ / AI วิเคราะห์ / ดูหมวด\n• เพิ่มหมวด ชานม กลุ่ม อาหาร งบ 500 บาท\nจดวันนี้รับแต้มอัตโนมัติวันละ 1 แต้ม\nส่งรูปใบเสร็จ หรือถามก่อนจ่ายได้ด้วยครับ",
  },
  {
    id: "installment-help",
    title: "วิธีผ่อนสินค้า",
    userPrompt: "ผ่อน",
    source: "lib/chat/actions/installments.ts (เติ้ล)",
    text: "พิมพ์ เช่น ผ่อน โทรศัพท์ ยอดรวม 12000 บาท 12 งวด เริ่ม 2026-12-01 หรือระบุ งวดละ 1000 บาท 12 งวด พร้อมวันเริ่มครับ\nยอดรวมต้องเป็นยอดผ่อนคงเหลือที่ต้องจ่ายจริง รวมดอกเบี้ยและค่าธรรมเนียมแล้ว ไม่รวมเงินดาวน์ที่จ่ายไปแล้ว ระบบยังไม่คำนวณดอกเบี้ยหรือเงินดาวน์ให้ครับ",
  },
  {
    id: "how-to-record",
    title: "วิธีจดรายจ่าย",
    userPrompt: "วิธีจด",
    source: "lib/chat/cards.ts (พอ)",
    text: "จดรายจ่าย พิมพ์ชื่อกับยอดได้เลยครับ เช่น «ข้าว 45»\nรายรับ พิมพ์ รับ ตามด้วยยอด เช่น «รับ 500»\nหลายรายการพิมพ์ในข้อความเดียวได้ เช่น «ข้าว 45 กาแฟ 55» แล้วกดยืนยัน\nจดย้อนหลัง กรอกในแอปแล้วเลือกวันที่ได้เลย",
  },
  {
    id: "correction-reply",
    title: "ตอบรับแก้ยอดที่ไม่มีรายการ",
    userPrompt: "ใช่ 400",
    source: "lib/line/handle-event.ts (พอ/เติ้ล)",
    text: "ยังไม่ได้บันทึกหรือแก้รายการครับ หากต้องการแก้รายการล่าสุด พิมพ์ “แก้ยอดล่าสุด 400 บาท” โดยเปลี่ยน 400 เป็นยอดที่ถูกต้อง หรือพิมพ์ “ดูรายการ” เพื่อเลือกรายการเดิมก่อนแก้",
  },
  {
    id: "delete-data",
    title: "ลบข้อมูลได้ไหม",
    userPrompt: "ลบข้อมูลได้ไหม",
    source: "lib/chat/messages.ts (พอ)",
    text: "ลบข้อมูลได้ครับ ทำในแอปที่ ตั้งค่า › ลบข้อมูลของฉัน\nจะลบยอดเงิน รอบเงิน บิล รายการที่จด และแต้มทั้งหมด กู้คืนไม่ได้ พอใช้จึงไม่ลบให้จากแชต ต้องกดยืนยันในแอปเองครับ",
  },
];

function guideSamples(): Sample[] {
  const titles: Record<string, string> = {
    ...Object.fromEntries(Object.entries(EXTRA_HELP).map(([id, h]) => [id, h.title])),
    ...Object.fromEntries(ONBOARDING_STEPS.map((s) => [s.id, s.title])),
  };
  const out: Sample[] = [];
  for (const [id, title] of Object.entries(titles)) {
    const reply = onboardingHelp(`guide:${id}`);
    if (!reply) continue;
    out.push({
      id: `guide-${id}`,
      title: `คู่มือ: ${title}`,
      userPrompt: `(กดปุ่มคู่มือ) guide:${id}`,
      source: "lib/line/onboarding.ts + help-request.ts (เติ้ล)",
      text: reply.text,
    });
  }
  return out;
}

// The samples, in the same order as the old (C5) and new (C5N) batches.
export function longTextSamples(): LongTextSample[] {
  return [...COPIES, ...guideSamples()];
}

export function buildLongTextScenarios(appOrigin?: string): FlexDemoScenario[] {
  return longTextSamples().map((s, i): FlexDemoScenario => ({
    id: `long-${s.id}`,
    batch: "C5",
    code: `L-${String(i + 1).padStart(2, "0")}`,
    compareId: `new-${s.id}`,
    title: `${s.title} · ${s.text.length} ตัวอักษร`,
    userPrompt: `${s.userPrompt}  ·  ที่มา: ${s.source}`,
    // Same quick replies the runtime adds to every answer (withAppButton in lib/line/reply.ts)
    message: buildConversationCard({
      type: "text",
      text: s.text,
      quickReply: {
        items: [
          { type: "action", action: { type: "uri", label: "เปิดแอป", uri: miniAppUrl("/app", appOrigin) } },
          { type: "action", action: { type: "postback", label: "วิธีใช้", data: "guide:all", displayText: "ขอวิธีใช้" } },
        ],
      },
    }),
  }));
}
