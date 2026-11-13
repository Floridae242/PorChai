import type { EssentialsRequest } from "@/lib/api-types";
import type { Satang } from "@/lib/calc/money";
import { parseBahtInput } from "@/lib/format/money";

// Backend gap #2 (DevLead/backend-gaps.md): the wire format only knows {food, transport}, but the user
// enters ONE daily total. Send it all as food and 0 transport. This is the only place that does it.
export function essentialsFromDaily(perDay: Satang): EssentialsRequest {
  return { food: perDay, transport: 0 };
}

// "No daily essentials at all" is a real answer (docs 5: set 0), but parseBahtInput rejects zero.
const ZERO_TEXT = /^[0๐]+(\.[0๐]*)?$/;
const MSG_EMPTY = "ใส่ค่าจำเป็นต่อวันก่อน (ถ้าไม่มีเลยให้ใส่ 0)";
const MSG_BY_REASON = {
  empty: MSG_EMPTY,
  not_number: "ใส่เป็นตัวเลข เช่น 480",
  not_positive: "ใส่ค่าจำเป็นมากกว่า 0",
  too_many_decimals: "ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง",
  too_large: "ค่าจำเป็นสูงเกินไป ตรวจตัวเลขอีกครั้ง",
} as const;

// The single "ค่าจำเป็นต่อวัน (บาท)" field used by every screen that asks for essentials.
export function parseEssentialsInput(text: string): { ok: true; satang: Satang } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, message: MSG_EMPTY };
  if (ZERO_TEXT.test(trimmed)) return { ok: true, satang: 0 };
  const parsed = parseBahtInput(trimmed);
  if (parsed.ok) return { ok: true, satang: parsed.satang };
  return { ok: false, message: MSG_BY_REASON[parsed.reason] };
}
