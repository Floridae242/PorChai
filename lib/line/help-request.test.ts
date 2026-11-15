import { expect, it } from "vitest";
import { readHelpRequest } from "./help-request";
import { onboardingHelp } from "./onboarding";
import { splitExplicitExpenses } from "@/lib/chat/multi-expense";

it.each([
  "จดหลายรายการพร้อมกันได้หรือไม่",
  "จดหลายรายการพร้อมกันได้ไหมครับ",
  "บันทึกหลายรายจ่ายได้มั้ย",
  "ขอวิธีจดทีละหลายรายการ",
  "ข้าว 45 กาแฟ 55 จดพร้อมกันได้หรือเปล่า",
  "พิมพ์หลายรายการอย่างไร",
])("intercepts multi-record capability/how-to before the financial flow: %s", message => {
  const help = readHelpRequest(message);
  expect(help).toEqual({ topic: "multi_record" });
  const answer = onboardingHelp(`guide:${help!.topic}`)!;
  expect(answer.text).toContain("2–5");
  expect(answer.text).toContain("จดทั้งหมด");
  expect(answer.text).toContain("ข้าว 45\nกาแฟ 55");
  expect(answer.text).toContain("ยังไม่ได้สร้างรายการร่างหรือบันทึก");
  expect(answer).not.toHaveProperty("pending");
});

it("does not hijack the real concatenated three-expense input", () => {
  const message = "กินปลาหมึกย่าง70บาทน้ำส้มอีก30บาทซูชิอีก30บาท";
  expect(readHelpRequest(message)).toBeNull();
  expect(splitExplicitExpenses(message)).toEqual([
    {title:"ปลาหมึกย่าง",amount:7000,category:"food"},
    {title:"น้ำส้ม",amount:3000,category:"food"},
    {title:"ซูชิ",amount:3000,category:"food"},
  ]);
});
it.each([
  "ขอวิธีใช้",
  "ขอวิธีใช้งานหน่อยครับ",
  "ขอดูคู่มือ",
  "ช่วยสอนหน่อย",
  "ไม่รู้วิธีใช้",
  "ใช้งานไม่เป็น",
  "ใช้ยังไง",
  "ทำอะไรได้บ้าง",
  "ขอวิธีใช้ทุกฟีเจอร์",
  "เริ่มใช้งาน",
  "help please",
])("opens general help for %s", (s) =>
  expect(readHelpRequest(s)).toEqual({ topic: null }),
);
it.each([
  ["ขอวิธีจดรายรับ 1000 บาท", "income"],
  ["จดข้าว 50 ยังไงครับ", "record"],
  ["ขอวิธีผ่อนโทรศัพท์", "plans"],
  ["อยากรู้วิธีตั้งงบ", "categories"],
  ["ทำยังไงถึงได้แต้ม", "points"],
  ["ขอวิธีส่งสลิป", "scan"],
  ["ลบรายการยังไง", "edit"],
  ["ขอวิธีค้นรายจ่าย", "search"],
  ["ดูรายงานอย่างไร", "reports"],
  ["ขอวิธีปรับยอดเงินจริง", "balance"],
  ["ขอวิธีตั้งค่าอาหาร", "essentials"],
  ["ขอวิธีเปลี่ยนวันรับเงิน", "payday"],
  ["กันเงินเผื่ออย่างไร", "buffer"],
  ["ขอวิธีเปิดเตือนจด", "reminders"],
  ["ขอวิธีแจ้งเตือน", "notify"],
  ["ขอวิธีลองก่อนจ่าย", "decide"],
  ["คูปองใช้ยังไง", "promos"],
  ["ขอวิธีลบข้อมูล", "privacy"],
])("routes %s to read-only %s help", (s, topic) =>
  expect(readHelpRequest(s)).toEqual({ topic }),
);
it.each([
  "ข้าว 50",
  "ได้รับเงิน 1000 บาท",
  "ช่วยจดข้าว 50",
  "เพิ่มบิล ค่าหอ 500 บาท",
  "ชาบู 199 ไหวไหม",
  "ผ่อน โทรศัพท์ ยอดรวม 12000 บาท 12 งวด เริ่ม 2026-12-01",
  "ไม่ต้องสอนแล้ว ข้าว 50",
  "หนังสือวิธีใช้คอม 100",
])("does not hijack ordinary requests: %s", (s) =>
  expect(readHelpRequest(s)).toBeNull(),
);
