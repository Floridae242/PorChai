import type { Summary } from "@/lib/api-types";
import {
  computeBudget,
  tomorrowBudget,
  tryOut,
  type BudgetInput,
} from "@/lib/calc/budget";
import {
  holdMessage,
  keptMessage,
  noCycleMessage,
  recordedMessage,
  tryMessage,
  welcomeMessage,
  type Draft,
} from "@/lib/chat/messages";
import type { LineMessage } from "./reply";
import type { FlexMessage } from "./branded-flex";

export type FlexExample = Readonly<{
  id: string;
  label: string;
  description: string;
  userText: string | null;
  message: FlexMessage;
}>;

function example(
  id: string,
  label: string,
  description: string,
  userText: string | null,
  message: LineMessage,
): FlexExample {
  if (message.type !== "flex") throw new Error(`Expected Flex card: ${id}`);
  return { id, label, description, userText, message };
}

/** Public, fictional fixtures only. No database, LINE token, account or outgoing reply is used. */
export function flexExamples(): FlexExample[] {
  const input: BudgetInput = {
    balance: 235500,
    spentToday: 4500,
    emergencyBuffer: 12000,
    savings: 24000,
    reserved: 60000,
    essentialPerDay: 7000,
    today: "2026-11-12",
    payday: "2026-11-24",
  };
  const summary: Summary = {
    ...input,
    balanceAsOf: "2026-11-12T05:00:00+07:00",
    basis: "preview-only",
    budget: computeBudget(input),
  };
  // An empty key is rejected by readDraft. Exported demo postbacks cannot record real spending.
  const draft: Draft = {
    title: "ข้าวเที่ยง",
    amount: 4500,
    category: "food",
    key: "",
  };
  const purchase: Draft = {
    ...draft,
    title: "ชาบู",
    amount: 19900,
    category: "food",
  };
  const trial = {
    ...tryOut(input, { buy: purchase.amount, release: 0 }),
    basis: "preview-only",
    countsThisCycle: true,
    checks: null,
  };

  return [
    example(
      "welcome",
      "ต้อนรับ",
      "เพิ่มเพื่อนหรือพิมพ์ “เมนู” แล้วเลื่อนดู 4 การ์ด",
      null,
      welcomeMessage(),
    ),
    example(
      "receipt",
      "จดสำเร็จ",
      "ยอดจากตัวอย่างกลาง 2,400 บาท · จดข้าว 45 บาท",
      "ข้าวเที่ยง 45",
      recordedMessage(
        draft,
        summary,
        tomorrowBudget(input),
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ),
    example(
      "confirm",
      "เช็กก่อนจ่าย",
      "ยอดสูงกว่างบวันนี้ ให้เลือกยืนยันจ่ายจริงหรือลองก่อนซื้อ",
      "ชาบู 199",
      holdMessage(purchase, 7500),
    ),
    example(
      "trial",
      "ลองก่อนซื้อ",
      "ตัวเลขคำนวณด้วยสูตรเดียวกับระบบจริง แต่เป็นข้อมูลสมมติ",
      "ลองก่อนซื้อ",
      tryMessage(purchase, trial),
    ),
    example(
      "kept",
      "เก็บในแผน",
      "ยืนยันการกันเงินในแผน โดยยังไม่หักเงินจริง",
      "เก็บไว้ในแผน",
      keptMessage(purchase, {
        ...summary,
        reserved: summary.reserved + purchase.amount,
        budget: trial.after ?? summary.budget,
      }),
    ),
    example(
      "setup",
      "เริ่มตั้งแผน",
      "เมื่อยังไม่มีรอบเงิน พาไปตั้งค่าผ่าน LIFF",
      "ข้าว 45",
      noCycleMessage(),
    ),
  ];
}
