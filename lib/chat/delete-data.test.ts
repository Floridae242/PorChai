import { describe, expect, it } from "vitest";
import { isDeleteDataAsk } from "@/lib/chat/delete-data";

// «ลบข้อมูลได้ไหม» (15 Nov, the bot greeted instead): how to delete the account, answered by a rule.
// Deleting one entry («ลบรายการล่าสุด») is the chat command, not this.

describe("isDeleteDataAsk", () => {
  it.each([
    "ลบข้อมูลได้ไหม",
    "ลบข้อมูล",
    "อยากลบบัญชี",
    "ขอลบข้อมูลของฉัน",
    "ลบข้อมูลทั้งหมดยังไง",
    "ลบ ข้อมูล ได้ มั้ย",
    "ลบแอคเคาท์ยังไง",
    "ลบแอคเค้าท์",
    "ลบบัญชีผู้ใช้",
    "Delete account",
    "delete my data",
    "ลบทั้งหมด",
  ])("«%s» asks how to delete the account", (text) => {
    expect(isDeleteDataAsk(text)).toBe(true);
  });

  it.each([
    "ลบรายการล่าสุด",
    "ลบรายจ่าย ข้าว",
    "ลบบิล ค่าหอ",
    "ลบแผน 1",
    "ลบรายการทั้งหมด",
    "ลบข้อมูลรายจ่ายข้าว",
    "ข้อมูลปลอดภัยไหม",
    "บัญชีธนาคารผูกได้ไหม",
    "ข้าว 45",
    "ลบ",
    "",
  ])("«%s» is not about deleting the account", (text) => {
    expect(isDeleteDataAsk(text)).toBe(false);
  });
});
