import { describe, expect, it } from "vitest";
import { fields, parseIntent, statedDate, statedMoney } from "./parse";

const today = "2026-11-15";
it.each([
  "สร้างบิลเน็ตทุกวันที่ 25 ของเดือน",
  "ช่วยสร้างบิล เน็ต ทุกวันที่ ๒๕ ของเดือนครับ",
  "เพิ่มบิล ค่าเน็ต ทุกวันที่ 25",
])("recognizes a monthly bill command without treating its due day as money: %s", message => {
  const intent = parseIntent(message, today);
  expect(intent).toMatchObject({ tool: "add_bill", repeat: "monthly", date: "2026-11-25" });
  expect(intent?.amount).toBeUndefined();
  expect(intent?.title).toMatch(/เน็ต/u);
  expect(intent?.title).not.toMatch(/ทุก|วันที่|เดือน/u);
});
it.each(["ยังไม่จ่าย 3 หน้า 1", "ยังไม่ได้จ่ายบิล ๓ หน้า ๑", "ไม่ได้จ่ายแผน 3", "ยังไม่จ่ายบิลล่าสุด"])("routes an explicit unpaid correction safely: %s", (message) => {
  expect(parseIntent(message, today)).toMatchObject({ tool: "plan_action", action: "unpay", target: message.includes("ล่าสุด") ? "latest" : 3 });
});
it("rejects an impossible calendar date before asking for money", () => {
  expect(() => parseIntent("เพิ่มบิล ค่าเน็ต 30 บาท วันที่ 2026-02-30", today)).toThrow(/วันที่/);
});
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
    ["แก้ยอดล่าสุด 400", "entry_edit"],
    ["แก้ไขยอดล่าสุด ๔๐๐ บาท", "entry_edit"],
    ["ขอแก้ยอดล่าสุด 400 บาทครับ", "entry_edit"],
    ["เปลี่ยนยอดล่าสุด 400", "entry_edit"],
    ["แก้ยอดเมื่อกี้ 400", "entry_edit"],
    ["แก้ยอดข้าว 400", "entry_edit"],
    ["แก้ยอดเงิน 400", "balance"],
    ["แก้ยอดเงิน๔๐๐", "balance"],
    ["แก้ยอดเงินจริง 400", "balance"],
    ["เปิดสรุปรายวัน เวลา 20:00", "notifications"],
    ["ปิดแจ้งเตือน", "notifications"],
    ["เริ่มรอบเงิน", "setup"],
    ["เปิดเตือนจด", "reminders"],
    ["กันเงินเผื่อ 0 บาท", "buffer"],
    ["ดูคูปอง", "promos"],
    ["ดูโปร", "promos"],
    ["ดูโฆษณา", "promos"],
    ["ดูโปรตัวอย่าง", "promos"],
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
    "โปรแกรมเรียน 100",
    "โปร",
    "รับคูปอง",
    "คูปอง",
    "ดูโปรแกรมเรียน",
    "อย่าแสดงโฆษณา",
  ])("preserves ordinary chat and negative requests: %s", (message) => {
    expect(parseIntent(message, today)).toBeNull();
  });
  it.each([
    "-100", "−10", "–10", "—10", "- 10", "+ 10", "− ๑๐",
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
    expect(parseIntent("แก้ยอดล่าสุด 400", today)).toMatchObject({tool:"entry_edit",target:"latest",amount:40000});
    expect(parseIntent("แก้ยอดเมื่อกี้ ๔๐๐", today)).toMatchObject({tool:"entry_edit",target:"latest",amount:40000});
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

// 16 Nov: «เพิ่มบิล ค่าไฟ 500 วันที่ 20» was saved with no date
describe("«วันที่ N» on a new bill or plan is the next such day", () => {
  it.each([
    ["เพิ่มบิล ค่าไฟ 500 วันที่ 20", "2026-11-15", "2026-11-20"],
    ["เพิ่มบิล ค่าไฟ 500 วันที่ 15", "2026-11-15", "2026-11-15"],
    ["เพิ่มบิล ค่าไฟ 500 วันที่ 5", "2026-11-15", "2026-12-05"],
    // A monthly anchor must stay 31; start on the next real 31st, then clamp shorter future months.
    ["เพิ่มบิล ค่าเน็ต 300 ทุกวันที่ 31", "2026-11-15", "2026-12-31"],
    ["เพิ่มบิล ค่าเน็ต 300 วันที่ 3", "2026-12-20", "2027-01-03"],
    ["เพิ่มแผน รองเท้า 1500 วันที่ 25", "2026-11-15", "2026-11-25"],
  ])("«%s» on %s → %s", (message, on, due) => {
    const intent = parseIntent(message, on);
    expect(intent).toMatchObject({ date: due });
  });
  it("the amount is still the money, not the day", () => {
    expect(parseIntent("เพิ่มบิล ค่าไฟ 500 วันที่ 20", "2026-11-15")).toMatchObject({ amount: 50000 });
  });
  it.each(["เพิ่มบิล ค่าไฟ 500 วันที่ 0", "เพิ่มบิล ค่าไฟ 500 วันที่ 32"])("«%s» has no date", (message) => {
    expect(parseIntent(message, "2026-11-15")?.date).toBeUndefined();
  });
});
it.each([
  ["สร้างบิลค่าเน็ต 399 บาท ทุกวันที่ 25 ของเดือน", 39900, "ค่าเน็ต"],
  ["สร้าง บิล เน็ต ทุกวันที่ ๒๕ ของเดือน ๓๙๙ บาท", 39900, "เน็ต"],
  ["ตั้งบิลเน็ตเดือนละ 399 วันที่ 25", 39900, "เน็ต"],
])("keeps the monthly price and title separate from scheduling words: %s", (message, amount, title) => {
  expect(parseIntent(message, today)).toMatchObject({ tool: "add_bill", amount, title, repeat: "monthly", date: "2026-11-25" });
});
it("preserves an explicit ISO start date without leaving date fragments in the bill title", () => {
  expect(parseIntent("สร้างบิล ค่าเน็ต 399 บาท รายเดือน วันที่ 2026-12-25", today))
    .toMatchObject({ title: "ค่าเน็ต", amount: 39900, repeat: "monthly", date: "2026-12-25" });
});
it.each(["2026-12-25", "๒๐๒๖-๑๒-๒๕"])("preserves Thai bill names while removing an ISO start date: %s", date => {
  expect(parseIntent(`สร้างบิลค่าน้ำ399บาทรายเดือนวันที่${date}`, today))
    .toMatchObject({ title: "ค่าน้ำ", amount: 39900, repeat: "monthly", date: "2026-12-25" });
});

// 16 Nov: «ค้นหา ข้าว», «ตั้งเตือน 20:00», «ปิดเตือน» got «ตอบไม่ได้»
describe("shorter search and reminder words", () => {
  it("«ค้นหา ข้าว» searches entries for ข้าว", () => {
    expect(parseIntent("ค้นหา ข้าว", today)).toMatchObject({ tool: "search", query: "ข้าว" });
  });
  it("«ค้นหาเว็บ ราคา iPhone» is not an entry search", () => {
    expect(parseIntent("ค้นหาเว็บ ราคา iPhone", today)?.tool).not.toBe("search");
  });
  it("«ตั้งเตือน 20:00» sets the reminder to record at 20:00", () => {
    expect(parseIntent("ตั้งเตือน 20:00", today)).toMatchObject({ tool: "reminders", time: "20:00" });
  });
  it.each([["ปิดเตือน", false], ["เปิดเตือน", true]])("«%s» turns the reminder %s", (text, enabled) => {
    expect(parseIntent(text, today)).toMatchObject({ tool: "reminders", enabled });
  });
});

it.each([
  "ตั้งแจ้งเตือนจ่ายค่าบิลเน็ตมือถือ วันที่ 23 พฤศจิกายน เวลา 00:01",
  "ช่วยตั้งเตือนจ่ายค่าเน็ต วันที่ 23 เวลา 09:00",
  "เปิดเตือนบิลค่าหอ", "เปลี่ยนเตือนบิล เวลา 22:00",
  "ปิดแจ้งเตือนบิลค่าหอ", "ตั้งเวลาแจ้งเตือนบิลค่าเน็ต เวลา 21:00",
  "เปลี่ยนเวลาแจ้งเตือนบิล เวลา 21:00", "ดูแจ้งเตือนบิลค่าหอ",
])("bill reminder help cannot mutate global notification preferences: %s", message => {
  expect(parseIntent(message, today)).toEqual({ tool: "bill_reminder_help" });
});
it("keeps the next reward page instead of looping to page one", () => {
  expect(parseIntent("ดูของรางวัล หน้า 2", today)).toMatchObject({ tool: "rewards", page: 2 });
});
