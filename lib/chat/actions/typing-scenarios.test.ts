import { describe, expect, it } from "vitest";
import { parseIntent } from "./parse";
import type { Tool } from "./types";

const today = "2026-11-18";
const commands: [string, Tool][] = [
  ["ดูรายงานวันนี้", "report"], ["ดูรายงานเดือนนี้", "report"],
  ["ค้นหารายจ่าย ข้าว", "search"], ["ดูรายการ", "entries"], ["ดูแผน", "plans"],
  ["ดูแต้ม", "points"], ["ดูของรางวัล", "rewards"], ["ดูคูปอง", "promos"],
  ["ดูหมวด", "categories"], ["วิเคราะห์การใช้เงิน", "insights"],
  ["เปิดสรุปรายวัน เวลา 20:00", "notifications"], ["ปิดเตือน", "reminders"],
  ["แก้รายการล่าสุด 50 บาท", "entry_edit"], ["ลบรายการล่าสุด", "entry_delete"],
  ["จ่ายบิล 1", "plan_action"], ["กันเงินเผื่อ 100 บาท", "buffer"],
];
const wrappers = [
  (s: string) => s, (s: string) => `  ${s}  `, (s: string) => `ช่วย${s}ครับ`,
  (s: string) => `รบกวนช่วย${s}หน่อยนะคะ`, (s: string) => `${s}ค่ะ!`,
  (s: string) => `\t${s.replaceAll(" ", "\u00a0")}\n`,
];
describe("typing variations retain the same feature intent", () => {
  it.each(commands.flatMap(([command, tool]) => wrappers.map(wrap => ({ input: wrap(command), tool }))))
    ("$input → $tool", ({ input, tool }) => expect(parseIntent(input, today)?.tool).toBe(tool));
});

it.each([
  "สร้างบิลเน็ต399บาททุกวันที่25ของเดือน", "สร้าง บิล เน็ต 399 บาท ทุกวันที่ 25 ของเดือน",
  "ขอสร้างบิลเน็ต 399 บาท ทุกวันที่ 25 ของเดือน", "รบกวนช่วยสร้างบิลเน็ต 399 บาท ทุกวันที่ 25 ของเดือนหน่อยนะคะ",
  "สร้างบิลเน็ต\n399 บาท\nทุกวันที่ 25 ของเดือน", "สร้างบิลเน็ต ๓๙๙ บาท ทุกวันที่ ๒๕ ของเดือนค่ะ",
  "สร้างบิลเน็ต ３９９ บาท ทุกวันที่ ２５ ของเดือน", "สร้างบิลเน็ต 399 บาท ทุกวันที่ 25 ของเดือนครับ!",
  "สร้างบิลเน็ต 399 บาท วันนี้ ทุกวันที่ 25 ของเดือน",
])("bill typing variation preserves title, amount and monthly day: %s", input => {
  expect(parseIntent(input, today)).toMatchObject({ tool: "add_bill", title: "เน็ต", amount: 39900, repeat: "monthly", date: "2026-11-25" });
});

it.each([
  "สร้างบิลเน็ต399บาททุกวันที่25หรือ26", "สร้างบิลเน็ต399บาททุกวันที่25ถึง26",
  "สร้างบิลเน็ต399บาททุกวันที่25และวันที่26",
  "สร้างบิลเน็ต399บาทรายเดือนวันที่2026-12-25หรือ2026-12-26",
  "สร้างบิลเน็ต399บาททุกวันที่25เริ่ม2026-12-28",
  "สร้างบิลเน็ต399บาทวันนี้ทุกวันที่32",
  "สร้างบิลเน็ต399บาทรายเดือนวันที่2026-12-25หรือวันที่26",
])("asks to clarify conflicting bill dates rather than choosing the first: %s", input => {
  expect(() => parseIntent(input, today)).toThrow(/วัน/u);
});
it("keeps a compatible explicit start and monthly due day", () => {
  expect(parseIntent("สร้างบิลเน็ต399บาททุกวันที่25เริ่ม2026-12-25", today))
    .toMatchObject({ title: "เน็ต", amount: 39900, repeat: "monthly", date: "2026-12-25" });
});
