import { describe, expect, it } from "vitest";
import {
  buildAiCompareCard,
  buildHabitReminderCard,
  buildOcrDraftCard,
  buildPointsLinkMessage,
  buildPromoLinkMessage,
  buildRecordedCard,
  buildTryBeforeBuyCard,
} from "../index";

describe("Flex Card Wording & Content Contract", () => {
  it("C-3 Recorded Card displays exact remaining budget and category badge", () => {
    const msg = buildRecordedCard({
      entryId: "e1",
      items: [{ id: "e1", title: "ข้าว", amount: 4500, category: "food" }],
      totalAmount: 4500,
      dailyBudget: 12000,
      spentToday: 4500,
      todayRemaining: 7500,
    });
    const json = JSON.stringify(msg);
    expect(json).toContain("จดแล้ว ✓");
    expect(json).toContain("ข้าว");
    expect(json).toContain("45 บาท");
    expect(json).toContain("อาหาร");
    expect(json).toContain("วันนี้ใช้ได้อีก");
    expect(json).toContain("75 บาท");
    expect(json).toContain("ใช้ไปแล้ว 45 / 120 บาท");
  });

  it("C-4 Over-budget Card displays overspend and tomorrow budget adjustment", () => {
    const msg = buildRecordedCard({
      entryId: "e2",
      items: [{ id: "e2", title: "ชาบู", amount: 35000, category: "food" }],
      totalAmount: 35000,
      dailyBudget: 12000,
      spentToday: 35000,
      todayRemaining: -23000,
      tomorrowDailyBudget: 9900,
    });
    const json = JSON.stringify(msg);
    expect(json).toContain("เกินงบ 230 บาท");
    expect(json).toContain("พรุ่งนี้ใช้ได้ 120 → 99 บาท/วัน");
  });

  it("C-16 Habit Reminder Card uses exact 3 buttons [ใช่ จดเลย] [แก้ยอด] [วันนี้ไม่ได้ซื้อ]", () => {
    const msg = buildHabitReminderCard({
      reminderId: "rem1",
      habitTitle: "ข้าวเที่ยง",
      habitAmount: 5000,
    });
    const json = JSON.stringify(msg);
    expect(json).toContain("วันนี้ยังไม่เห็นรายการข้าวเที่ยงครับ");
    expect(json).toContain("50 บาท");
    expect(json).toContain("ใช่ จดเลย");
    expect(json).toContain("แก้ยอด");
    expect(json).toContain("วันนี้ไม่ได้ซื้อ");
  });

  it("C-18 Ask AI Card uses exact status terms 'เก็บไว้ในแผน' and 'ยืนยันจ่ายจริง'", () => {
    const msg = buildAiCompareCard({
      draftId: "d1",
      itemTitle: "หมูกระทะ",
      amount: 19900,
      dueLabel: "ศุกร์นี้",
      maxSpendable: 15000,
      overBy: 4900,
      beforeDaily: 12000,
      afterDaily: 10300,
      hasMatchingPromo: true,
    });
    const json = JSON.stringify(msg);
    expect(json).toContain("เกินงบ 49 บาท");
    expect(json).toContain("เก็บไว้ในแผน");
    expect(json).toContain("ยืนยันจ่ายจริง");
    expect(json).toContain("ลองยอดอื่น");
    expect(json).toContain("ดูเปรียบเทียบเต็ม");
    expect(json).toContain("ดูโปรที่ใช้ได้");
    // Must not use deprecated terms
    expect(json).not.toContain("กันไว้ซื้อ");
  });

  it("C-6 Try Before Buy Card shows before/after daily budget and savings protection", () => {
    const msg = buildTryBeforeBuyCard({
      draftId: "t1",
      itemTitle: "รองเท้า",
      amount: 48000,
      beforeDaily: 12000,
      afterDaily: 8000,
      maxSpendable: 60000,
      essentialsPerDay: 7000,
      billsTotal: 60000,
    });
    const json = JSON.stringify(msg);
    expect(json).toContain("ปกติวันละ 120 บาท · ซื้อได้ไม่เกิน 600 บาท");
    expect(json).toContain("เหลือวันละ 80 บาท");
    expect(json).toContain("เก็บไว้ในแผน");
    expect(json).toContain("ยืนยันจ่ายจริง");
    expect(json).toContain("เลื่อนไปรอบหน้า");
  });

  it("C-17 OCR Draft Card requires user confirmation and supports slip kind selection", () => {
    const msg = buildOcrDraftCard({
      ocrId: "o1",
      merchantName: "ข้าวมันไก่ป้าศรี",
      amount: 5000,
      dateLabel: "วันนี้",
      candidateAmounts: [5000, 10700],
    });
    const json = JSON.stringify(msg);
    expect(json).toContain("ข้าวมันไก่ป้าศรี");
    expect(json).toContain("บันทึก");
    expect(json).toContain("แก้ยอด");
    expect(json).toContain("ยกเลิก");
    expect(json).toContain("ยอด 107 บาท");
  });

  it("C-19 & C-20 Promo and Points link messages contain NO shop names, prices, or discounts", () => {
    const promo = JSON.stringify(buildPromoLinkMessage());
    const points = JSON.stringify(buildPointsLinkMessage());
    expect(promo).toContain("เปิดหน้าสิทธิพิเศษ");
    expect(promo).not.toMatch(/\d+\s*บาท/);
    expect(points).toContain("เปิดแอป");
    expect(points).not.toMatch(/ชานม|ส่วนลด/);
  });
});
