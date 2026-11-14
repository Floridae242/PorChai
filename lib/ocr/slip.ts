import { addDays } from "@/lib/calc/time";
import { generateFromImage } from "@/lib/ai/gemini";
import { MAX_AMOUNT, MAX_TITLE } from "@/lib/chat/parse";

// OCR (layer 4): read a payment slip or receipt photo. The AI reads; the code keeps only sane values,
// and nothing is recorded until the user confirms the draft card (user's choice 13 Nov). The image is
// sent to Gemini (free tier, agreed with the user: say so on the consent screens) and never stored.

export type SlipKind = "expense" | "income" | "transfer" | "unknown";

export interface SlipReading {
  kind: SlipKind; // unknown → the card asks รายจ่าย / รับเงิน / โอนระหว่างบัญชี
  merchant: string;
  amount: number; // satang, the best guess
  candidates: number[]; // satang, other amounts on it (subtotal, total…) to pick from
  date: string; // YYYY-MM-DD; today when unreadable, in the future or older than 30 days
}

const KINDS = ["expense", "income", "transfer"];
const satang = (b: unknown): number | null => {
  if (typeof b !== "number" || !Number.isFinite(b)) return null;
  const s = Math.round(b * 100);
  return s > 0 && s <= MAX_AMOUNT ? s : null;
};
const realDate = (d: unknown): d is string =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;

export function slipFrom(ai: unknown, today: string): SlipReading | null {
  if (typeof ai !== "object" || ai === null) return null;
  const a = ai as { is_slip?: unknown; kind?: unknown; merchant?: unknown; amount_baht?: unknown; candidates_baht?: unknown; date?: unknown };
  if (a.is_slip !== true) return null;
  const main = satang(a.amount_baht);
  const others = (Array.isArray(a.candidates_baht) ? a.candidates_baht : []).map(satang).filter((s): s is number => s !== null);
  const all = [...new Set([...(main === null ? [] : [main]), ...others])];
  if (all.length === 0) return null;
  const merchant = typeof a.merchant === "string" ? a.merchant.trim().slice(0, MAX_TITLE) : "";
  const date = realDate(a.date) && a.date <= today && a.date >= addDays(today, -30) ? a.date : today;
  return {
    kind: KINDS.includes(a.kind as string) ? (a.kind as SlipKind) : "unknown",
    merchant: merchant || "สลิป",
    amount: all[0],
    candidates: all.length > 1 ? all : [],
    date,
  };
}

const PROMPT =
  "รูปนี้เป็นสลิปโอนเงิน/จ่ายเงินของธนาคารไทย หรือใบเสร็จร้านค้าไหม ตอบเป็น JSON เท่านั้น " +
  "is_slip = true ถ้าใช่ · kind = expense (เราจ่ายออก/ซื้อของ) · income (เราได้รับเงิน) · transfer (โอนระหว่างบัญชีตัวเอง) · unknown (ไม่แน่ใจ) " +
  "merchant = ชื่อร้านหรือชื่อผู้รับเงินสั้น ๆ (ถ้าเป็นชื่อคน ใส่แค่ชื่อต้น) · amount_baht = ยอดที่จ่ายจริง/ยอดรวมสุทธิ เป็นตัวเลข " +
  "candidates_baht = ยอดอื่นที่เห็นในรูป เช่น ยอดก่อนส่วนลด · date = วันที่ในรูปแบบ YYYY-MM-DD (ปี ค.ศ. ถ้าเป็น พ.ศ. ให้ลบ 543) " +
  "ห้ามใส่เลขบัญชี เลขอ้างอิง หรือข้อมูลอื่น";

const SCHEMA = {
  type: "object",
  properties: {
    is_slip: { type: "boolean" },
    kind: { type: "string", enum: ["expense", "income", "transfer", "unknown"] },
    merchant: { type: "string" },
    amount_baht: { type: "number", nullable: true },
    candidates_baht: { type: "array", items: { type: "number" } },
    date: { type: "string", nullable: true },
  },
  required: ["is_slip", "kind", "merchant", "amount_baht", "candidates_baht", "date"],
};

export async function readSlip(image: Uint8Array, mimeType: string, today: string): Promise<SlipReading | null> {
  const raw = await generateFromImage({ prompt: PROMPT, image, mimeType, schema: SCHEMA });
  if (!raw) return null;
  try {
    return slipFrom(JSON.parse(raw), today);
  } catch {
    return null;
  }
}
