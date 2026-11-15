import { describe, expect, it } from "vitest";
import { fields, parseIntent, statedDate, statedMoney } from "./parse";

const today = "2026-11-15";
describe("chat command boundaries", () => {
  it.each([
    ["ช่วยดูรายงานวันนี้", "report"],
    ["ขอดูรายงานเดือนนี้", "report"],
    ["ค้นหารายจ่าย ข้าว", "search"],
    ["อยากดูแต้ม", "points"],
    ["เพิ่มบิล ค่าหอ 500 บาท", "add_bill"],
    ["ดูแผน", "plans"],
    ["ยกเลิกการจ่ายบิล 1", "plan_action"],
    ["แก้รายการล่าสุด 60 บาท", "entry_edit"],
    ["เปิดสรุปรายวัน เวลา 20:00", "notifications"],
    ["ปิดแจ้งเตือน", "notifications"],
    ["เริ่มรอบเงิน", "setup"],
    ["เปิดเตือนจด", "reminders"],
    ["กันเงินเผื่อ 0 บาท", "buffer"],
    ["ดูคูปอง", "promos"],
  ])("routes %s without recording an expense", (message, tool) => {
    expect(parseIntent(message, today)?.tool).toBe(tool);
  });
  it.each([
    "ข้าว 45",
    "ได้รับเงิน 1000 บาท",
    "ไม่ต้องเปิดสรุปรายวัน",
    "ไม่จ่ายบิล 1",
    "ขอบคุณ",
    "ถ้าซื้อข้าว 50 จะพอไหม",
  ])("preserves ordinary chat and negative requests: %s", (message) => {
    expect(parseIntent(message, today)).toBeNull();
  });
  it.each([
    "-100",
    "+100",
    "ประมาณ 100",
    "100-200",
    "1e4",
    "1.999",
    "100 200", "100 หรือ 200 บาท",
    "100001",
    "NaN",
    "Infinity",
  ])("never guesses unclear or excessive money: %s", (message) => {
    expect(statedMoney(message)).toBeUndefined();
  });
  it("keeps index, amount, date and time separate", () => {
    expect(
      fields(
        "แก้รายการ 2 เป็น 50 บาท วันที่ 2026-11-14 เวลา 20:00",
        "entry_edit",
        today,
      ),
    ).toMatchObject({
      target: 2,
      amount: 5000,
      date: "2026-11-14",
      time: "20:00",
    });
    expect(statedMoney("๑,๐๐๐ บาท")).toBe(100000);
    expect(statedMoney("0")).toBe(0);
    expect(statedMoney("12.50 บาท")).toBe(1250);
  });
  it("reads explicit food and transport amounts independently", () => {
    expect(parseIntent("ตั้งค่าอาหาร 50 ค่ารถ 20", today)).toMatchObject({
      tool: "essentials",
      food: 5000,
      transport: 2000,
    });
  });
  // 15 Nov: spans are the report card (Monday to today for a week), not the AI
  it.each([
    ["สัปดาห์นี้ใช้ไปเท่าไร", "week", undefined],
    ["อาทิตย์นี้ใช้ไปกี่บาท", "week", undefined],
    ["สัปดาห์ที่แล้วใช้ไปเท่าไร", "week", "2026-11-08"],
    ["เมื่อวานใช้ไปเท่าไร", "day", "2026-11-14"],
    ["เมื่อวานใช้เงินไปกี่บาท", "day", "2026-11-14"],
    ["เดือนนี้ใช้ไปเท่าไร", "month", undefined],
  ])("«%s» is a %s report", (message, period, date) => {
    expect(parseIntent(message, today)).toMatchObject({ tool: "report", period, date });
  });

  it("only derives relative dates from the server's Thai date", () => {
    expect(statedDate("เมื่อวาน", today)).toBe("2026-11-14");
    expect(statedDate("พรุ่งนี้", today)).toBe("2026-11-16");
    expect(fields("ดูรายงานเดือนที่แล้ว", "report", today)).toMatchObject({
      period: "month",
      date: "2026-10-31",
    });
  });
});
