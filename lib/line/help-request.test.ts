import { expect, it } from "vitest";
import { readHelpRequest } from "./help-request";
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
