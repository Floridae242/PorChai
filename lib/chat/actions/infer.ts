import { generate } from "@/lib/ai/gemini";
import { fields } from "./parse";
import type { Intent, Tool } from "./types";

const READS = [
  "help",
  "report",
  "search",
  "entries",
  "plans",
  "points",
  "rewards",
  "notifications",
  "reminders",
] as const;
// The model routes read requests only. It never chooses an account, record ID, amount or mutation.
// App-specific wording gates this fallback so ordinary conversations do not add another model call.
export async function inferReadIntent(
  message: string,
  today: string,
): Promise<Intent | null> {
  if (
    message.length > 500 ||
    !/ดู|ขอ|ค้น|หา|สรุป|มี.*ไหม/u.test(message) ||
    !/รายงาน|รายจ่าย|รายการ|แผน|บิล|แต้ม|รางวัล|คูปอง|โปรโมชัน|แจ้งเตือน/u.test(message)
  )
    return null;
  const raw = await generate({
    system:
      "จำแนกคำขอดูข้อมูลในแอปพอใช้เท่านั้น ห้ามทำรายการหรืออ้างว่าทำสำเร็จ ถ้าผู้ใช้ขอเปลี่ยนข้อมูลหรือไม่ชัดให้ tool=none. search ใช้ค้นชื่อรายจ่าย query ต้องคัดลอกข้อความย่อยจากข้อความผู้ใช้ตรงๆ ห้ามเพิ่มเงื่อนไขเอง",
    input: message,
    schema: {
      type: "object",
      properties: {
        tool: { type: "string", enum: [...READS, "none"] },
        query: { type: "string" },
      },
      required: ["tool"],
    },
    maxOutputTokens: 100,
  });
  if (!raw) return null;
  let value: { tool?: unknown; query?: unknown };
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || !READS.includes(value.tool as (typeof READS)[number]))
    return null;
  const intent = fields(message, value.tool as Tool, today);
  // Model classification cannot opt in, opt out or change even a reminder time.
  delete intent.enabled;
  delete intent.time;
  if (intent.tool === "search") {
    if (
      typeof value.query !== "string" ||
      !value.query.trim() ||
      value.query.length > 120 ||
      !message.includes(value.query)
    )
      return null;
    intent.query = value.query;
  }
  return intent;
}
