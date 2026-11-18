import { describe, expect, it } from "vitest";
import { parseExpense } from "@/lib/chat/parse";
import { parseIntent } from "./parse";
import type { Intent, Tool } from "./types";

type Example = { input: string; expected?: Partial<Intent> };
// Compile-time completeness: adding a new chat Tool requires a deliberate test example.
const examples = {
  help: { input: "ทำอะไรได้บ้าง" }, insights: { input: "วิเคราะห์การใช้เงิน" },
  categories: { input: "ดูหมวด" }, category_save: { input: "ตั้งงบ อาหาร 2000 บาท" },
  category_entry: { input: "จด ชานม 50 หมวด ชานม" }, setup: { input: "เริ่มรอบเงิน" },
  income: { input: "ได้รับเงิน 500 บาท" }, entry: { input: "ข้าว 50 บาท" },
  report: { input: "ดูรายงานวันนี้", expected: { period: "day" } },
  search: { input: "ค้นรายจ่าย ข้าว", expected: { query: "ข้าว" } },
  entries: { input: "ดูรายการ" }, plans: { input: "ดูแผน" },
  add_bill: { input: "สร้างบิลค่าเน็ต399บาททุกวันที่25ของเดือน", expected: { title: "ค่าเน็ต", amount: 39900, repeat: "monthly", date: "2026-11-25" } },
  add_plan: { input: "เพิ่มแผน รองเท้า 1500 บาท วันที่ 2026-12-25", expected: { title: "รองเท้า", amount: 150000, date: "2026-12-25" } },
  installments: { input: "ผ่อน โทรศัพท์ ยอดรวม 1200 บาท 3 งวด เริ่ม 2026-12-25" },
  points: { input: "ดูแต้ม" }, claim_points: { input: "เช็กครบแล้ว" }, rewards: { input: "ดูของรางวัล" },
  promos: { input: "ดูคูปอง" }, notifications: { input: "เปิดสรุปรายวัน เวลา 20:00", expected: { enabled: true, time: "20:00", notification: "daily" } },
  bill_reminder_help: { input: "ตั้งแจ้งเตือนบิลค่าเน็ต เวลา 09:00" },
  reminders: { input: "ตั้งเตือน 20:00", expected: { enabled: true, time: "20:00" } },
  balance: { input: "ปรับยอด 2000 บาท", expected: { amount: 200000 } },
  buffer: { input: "กันเงินเผื่อ 100 บาท", expected: { amount: 10000 } },
  payday: { input: "ตั้งวันรับเงิน 2026-12-25", expected: { date: "2026-12-25" } },
  essentials: { input: "ตั้งค่าอาหาร 50 ค่ารถ 20", expected: { food: 5000, transport: 2000 } },
  entry_edit: { input: "แก้รายการล่าสุด 60 บาท", expected: { amount: 6000, target: "latest" } },
  entry_delete: { input: "ลบรายการล่าสุด", expected: { target: "latest" } },
  plan_action: { input: "จ่ายบิล 1", expected: { target: 1, action: "pay" } },
  web: { input: "ค้นเว็บ ราคาอาหาร", expected: { query: "ราคาอาหาร" } },
} satisfies Record<Tool, Example>;

const thaiDigits = (s: string) => s.replace(/\d/gu, digit => "๐๑๒๓๔๕๖๗๘๙"[Number(digit)]);
const fullwidthDigits = (s: string) => s.replace(/\d/gu, digit => "０１２３４５６７８９"[Number(digit)]);
describe("every chat feature routes supported framing without changing its meaning", () => {
  for (const [tool, example] of Object.entries(examples) as [Tool, Example][]) {
    const variants = tool === "entry" || tool === "income"
      ? [example.input, example.input.replaceAll(" ", ""), thaiDigits(example.input), `${example.input} ครับ`]
      : [example.input, ` ${example.input} `, `${example.input}ค่ะ!`, `รบกวนช่วย${example.input}หน่อยคับ`,
        thaiDigits(example.input), fullwidthDigits(example.input), example.input.replaceAll(" ", "\n")];
    it.each([...new Set(variants)])(`${tool}: %s`, input => {
      if (tool === "income" || tool === "entry") {
        expect(parseExpense(input)).toMatchObject({ kind: tool, amount: tool === "income" ? 50000 : 5000 });
      } else {
        expect(parseIntent(input, "2026-11-18")).toMatchObject({ tool, ...example.expected });
      }
    });
  }
});
