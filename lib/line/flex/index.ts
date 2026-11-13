export * from "./types";
export * from "./format";
export * from "./postback";
export * from "./cards/recorded";
export * from "./cards/habit-reminder";
export * from "./cards/ai-compare";
export * from "./cards/core-cards";
export * from "./cards/extras";
export * from "./cards/chat-extras";

import { buildRecordedCard } from "./cards/recorded";
import {
  buildHabitEditAskMessage,
  buildHabitReminderCard,
  buildHabitSkippedMessage,
} from "./cards/habit-reminder";
import {
  buildAiCompareCard,
  buildAskDateMessage,
  buildTryBeforeBuyCard,
} from "./cards/ai-compare";
import {
  buildBalanceAdjustAskMessage,
  buildHowToRecordCard,
  buildSavingsStatusCard,
  buildTodayBudgetCard,
  buildWelcomeCard,
} from "./cards/core-cards";
import {
  buildBillOrPaydayAlertCard,
  buildOcrDraftCard,
  buildPointsLinkMessage,
  buildPromoLinkMessage,
} from "./cards/extras";
import type { LineChatMessage } from "./types";

export interface FlexDemoScenario {
  id: string;
  batch: "C1" | "C2" | "C3" | "C4";
  code: string;
  title: string;
  userPrompt?: string;
  message: LineChatMessage;
  /** Optional map of postback action -> target scenario id for interactive simulation */
  nextOnAction?: Partial<Record<string, string>>;
}

/**
 * Complete catalog of all C1–C4 scenes matching the Final Demo sequence and Figma Conversation page.
 */
export function buildDemoScenarios(appOrigin?: string): FlexDemoScenario[] {
  return [
    // --- Batch C1: Main Demo ---
    {
      id: "c3-lunch",
      batch: "C1",
      code: "C-3",
      title: "จดข้าวเที่ยง (บันทึกทันที)",
      userPrompt: "ข้าว 45",
      message: buildRecordedCard({
        entryId: "ent_demo_1",
        items: [{ id: "ent_demo_1", title: "ข้าว", amount: 4500, category: "food" }],
        totalAmount: 4500,
        dailyBudget: 12000,
        spentToday: 4500,
        todayRemaining: 7500,
        appOrigin,
      }),
    },
    {
      id: "c3b-backdated",
      batch: "C1",
      code: "C-3b",
      title: "จดย้อนหลัง (เมื่อวาน ข้าว 45)",
      userPrompt: "เมื่อวาน ข้าว 45",
      message: buildRecordedCard({
        entryId: "ent_yest_45",
        heading: "จดย้อนหลัง ✓",
        dateLabel: "เมื่อวาน (3 พ.ย.)",
        items: [{ id: "ent_yest_45", title: "ข้าว", amount: 4500, category: "food" }],
        totalAmount: 4500,
        dailyBudget: 12000,
        spentToday: 0,
        todayRemaining: 11600,
        subnote: "หักจากยอดที่เหลือของรอบนี้แล้ว งบต่อวันปรับเป็น 116 บาท",
        isBackdated: true,
        appOrigin,
      }),
    },
    {
      id: "c16-reminder",
      batch: "C1",
      code: "C-16",
      title: "เตือนมื้อเที่ยง 12:30 (จากพฤติกรรม)",
      message: buildHabitReminderCard({
        reminderId: "rem_lunch_1",
        habitTitle: "ข้าวเที่ยง",
        habitAmount: 5000,
        timeLabel: "12:30",
        appOrigin,
      }),
      nextOnAction: {
        rem_yes: "c16b-confirmed",
        rem_edit: "c16c-ask-edit",
        rem_skip: "c16b-skipped",
      },
    },
    {
      id: "c16b-confirmed",
      batch: "C1",
      code: "C-16b",
      title: "หลังกด 'ใช่ จดเลย' → ยอดอัปเดต",
      userPrompt: "ใช่ จดเลย",
      message: buildRecordedCard({
        entryId: "ent_rem_1",
        items: [{ id: "ent_rem_1", title: "ข้าวเที่ยง", amount: 5000, category: "food" }],
        totalAmount: 5000,
        dailyBudget: 12000,
        spentToday: 5000,
        todayRemaining: 7000,
        compactActions: true,
        appOrigin,
      }),
    },
    {
      id: "c16c-ask-edit",
      batch: "C1",
      code: "C-16c (ถามยอด)",
      title: "หลังกด 'แก้ยอด' → ถามยอดใหม่",
      userPrompt: "แก้ยอด",
      message: buildHabitEditAskMessage({
        reminderId: "rem_lunch_1",
        habitTitle: "ข้าวเที่ยง",
        habitAmount: 5000,
      }),
      nextOnAction: {
        rem_edit_cancel: "c16-reminder",
      },
    },
    {
      id: "c16c-edited",
      batch: "C1",
      code: "C-16c (จด 60)",
      title: "พิมพ์แก้ยอดเป็น 60 → เหลือใช้ 60",
      userPrompt: "60",
      message: buildRecordedCard({
        entryId: "ent_rem_60",
        items: [{ id: "ent_rem_60", title: "ข้าวเที่ยง", amount: 6000, category: "food" }],
        totalAmount: 6000,
        dailyBudget: 12000,
        spentToday: 6000,
        todayRemaining: 6000,
        compactActions: true,
        appOrigin,
      }),
    },
    {
      id: "c16b-skipped",
      batch: "C1",
      code: "C-16b (ข้าม)",
      title: "หลังกด 'วันนี้ไม่ได้ซื้อ'",
      userPrompt: "วันนี้ไม่ได้ซื้อ",
      message: buildHabitSkippedMessage({
        habitTitle: "ข้าวเที่ยง",
        todayRemaining: 12000,
        appOrigin,
      }),
    },
    {
      id: "c4-overbudget",
      batch: "C1",
      code: "C-4",
      title: "ใช้เกินงบวันนี้ (ชาบู 350)",
      userPrompt: "ยืนยันจ่ายจริง",
      message: buildRecordedCard({
        entryId: "ent_shabu_350",
        items: [{ id: "ent_shabu_350", title: "ชาบู", amount: 35000, category: "food" }],
        totalAmount: 35000,
        dailyBudget: 12000,
        spentToday: 35000,
        todayRemaining: -23000,
        tomorrowDailyBudget: 9900,
        appOrigin,
      }),
    },
    {
      id: "c8-multiline",
      batch: "C1",
      code: "C-8",
      title: "จดหลายบรรทัด + พักรายการเกินงบ",
      userPrompt: "ข้าว 45\nกาแฟ 55\nชาบู 350",
      message: buildRecordedCard({
        entryId: "ent_multi_1",
        heading: "จดแล้ว 2 รายการ ✓",
        items: [
          { id: "ent_m1", title: "ข้าว", amount: 4500, category: "food" },
          { id: "ent_m2", title: "กาแฟ", amount: 5500, category: "food" },
        ],
        totalAmount: 10000,
        dailyBudget: 12000,
        spentToday: 10000,
        todayRemaining: 2000,
        pendingItem: { id: "pend_shabu", title: "ชาบู", amount: 35000 },
        appOrigin,
      }),
    },

    // --- Batch C2: Ask AI & Try Before Paying ---
    {
      id: "c18-ai-compare",
      batch: "C2",
      code: "C-18",
      title: "ถาม AI ก่อนจ่าย (หมูกระทะศุกร์ 199 · เกินงบ 49)",
      userPrompt:
        "วันศุกร์อยากกินหมูกระทะกับเพื่อน 199 บาท แต่ต้องกันค่าเดินทางไว้ แล้วก็อยากเก็บเงินตามเป้า ช่วยดูให้หน่อย",
      message: buildAiCompareCard({
        draftId: "draft_mookata_199",
        itemTitle: "หมูกระทะ",
        amount: 19900,
        dueLabel: "วันศุกร์",
        maxSpendable: 15000,
        overBy: 4900,
        beforeDaily: 12000,
        afterDaily: 10300,
        essentialsPerDay: 7000,
        explanation:
          "ค่าเดินทางและเงินออมยังกันไว้ครบ แต่ถ้าจ่าย 199 จะเกินที่ใช้เพิ่มได้ 49 บาท ทางเลือกคือเลื่อนนัด หรือเลือกร้านที่ไม่เกิน 150 บาท",
        hasMatchingPromo: true,
        appOrigin,
      }),
      nextOnAction: {
        pay_real: "c4-overbudget",
      },
    },
    {
      id: "c18b-ask-date",
      batch: "C2",
      code: "C-18b",
      title: "ถาม AI แต่ไม่ได้บอกวัน → ถามวันก่อนคำนวณ",
      userPrompt: "อยากกินหมูกระทะ 199",
      message: buildAskDateMessage({
        draftId: "draft_mookata_nodate",
        itemTitle: "หมูกระทะ",
        amount: 19900,
      }),
      nextOnAction: {
        ask_date_fri: "c18-ai-compare",
        ask_date_today: "c18-ai-compare",
        ask_date_tomorrow: "c18-ai-compare",
      },
    },
    {
      id: "c6-try-shoes",
      batch: "C2",
      code: "C-6",
      title: "ลองก่อนจ่าย (รองเท้า 480 · อยู่ในวงเงิน)",
      userPrompt: "ลอง รองเท้า 480",
      message: buildTryBeforeBuyCard({
        draftId: "try_shoes_480",
        itemTitle: "รองเท้า",
        amount: 48000,
        beforeDaily: 12000,
        afterDaily: 8000,
        maxSpendable: 60000,
        overBy: 0,
        essentialsPerDay: 7000,
        billsTotal: 60000,
        appOrigin,
      }),
    },
    {
      id: "c6b-try-other-amount",
      batch: "C2",
      code: "C-6b",
      title: "ลองราคาอื่นต่อเนื่อง (ซื้อ 250 → เหลือ 99/วัน)",
      userPrompt: "ซื้อ 250",
      message: buildTryBeforeBuyCard({
        draftId: "try_shoes_250",
        itemTitle: "รองเท้า",
        amount: 25000,
        beforeDaily: 12000,
        afterDaily: 9900,
        formulaNote: "(1,440 − 250) ÷ 12 วัน",
        appOrigin,
      }),
    },
    {
      id: "c7-try-meal",
      batch: "C2",
      code: "C-7",
      title: "ลองก่อนจ่ายระดับมื้อ (มื้อนี้ 300)",
      userPrompt: "ลอง มื้อนี้ 300",
      message: buildTryBeforeBuyCard({
        draftId: "try_meal_300",
        itemTitle: "มื้อนี้",
        amount: 30000,
        isMealToday: true,
        beforeDaily: 12000,
        afterDaily: 10300,
        appOrigin,
      }),
    },

    // --- Batch C3: Core & Rich Menu ---
    {
      id: "c1-welcome",
      batch: "C3",
      code: "C-1",
      title: "ต้อนรับเพื่อนใหม่ (พาไปตั้งค่า 3 ขั้น)",
      message: buildWelcomeCard({ appOrigin }),
    },
    {
      id: "c5-today-budget",
      batch: "C3",
      code: "C-5",
      title: "ถามงบวันนี้ (วันนี้ใช้ได้เท่าไหร่)",
      userPrompt: "วันนี้ใช้ได้เท่าไหร่",
      message: buildTodayBudgetCard({
        todayRemaining: 7500,
        spentToday: 4500,
        dailyBudget: 12000,
        disposablePool: 144000,
        daysRemaining: 12,
        savingsReserved: 24000,
        bufferReserved: 12000,
        balance: 235500,
        appOrigin,
      }),
      nextOnAction: {
        menu_record: "c14-howto",
        menu_try: "c6-try-shoes",
      },
    },
    {
      id: "c14-howto",
      batch: "C3",
      code: "C-14",
      title: "สอนวิธีจด 3 แบบ (กดปุ่มเมนู จดรายรับ/จ่าย)",
      userPrompt: "วิธีจดรายรับ/จ่าย",
      message: buildHowToRecordCard({ appOrigin }),
      nextOnAction: {
        menu_try: "c6-try-shoes",
        menu_today: "c5-today-budget",
      },
    },
    {
      id: "c10-balance-adjust",
      batch: "C3",
      code: "C-10",
      title: "ปรับยอดเงินจริง (เงินจริง 2,350)",
      userPrompt: "เงินจริง 2,350",
      message: buildBalanceAdjustAskMessage({
        requestId: "bal_req_1",
        systemBalance: 240000,
        actualBalance: 235000,
        diffAmount: 5000,
        billsReserved: 60000,
        beforeDaily: 12000,
        afterDaily: 11500,
      }),
      nextOnAction: {
        menu_today: "c5-today-budget",
      },
    },
    {
      id: "c15-savings-status",
      batch: "C3",
      code: "C-15",
      title: "ถามยอดเงินออม (ออมเท่าไหร่แล้ว)",
      userPrompt: "ออมเท่าไหร่แล้ว",
      message: buildSavingsStatusCard({
        savingsAmount: 24000,
        savingsPercent: 10,
        bufferAmount: 12000,
        appOrigin,
      }),
      nextOnAction: {
        bal_adjust_ask: "c10-balance-adjust",
      },
    },

    // --- Batch C4: OCR, Alerts, Quota, Links ---
    {
      id: "c17-ocr-draft",
      batch: "C4",
      code: "C-17",
      title: "ส่งรูปใบเสร็จ → รายการร่าง (ข้าวมันไก่ป้าศรี 50)",
      userPrompt: "[ส่งรูปใบเสร็จ]",
      message: buildOcrDraftCard({
        ocrId: "ocr_1",
        merchantName: "ข้าวมันไก่ป้าศรี",
        amount: 5000,
        dateLabel: "วันนี้ · 12:31",
        candidateAmounts: [5000, 10700],
        duplicateEntry: { id: "ent_dup", title: "ข้าว", amount: 5000, timeLabel: "12:31" },
        appOrigin,
      }),
      nextOnAction: {
        ocr_save: "c16b-confirmed",
      },
    },
    {
      id: "c17b-ocr-slip-kind",
      batch: "C4",
      code: "C-17b",
      title: "สลิปแยกประเภทไม่ได้ (รายจ่าย / รับเงิน / โอนบัญชีตัวเอง)",
      userPrompt: "[ส่งรูปสลิปธนาคาร 300 บาท]",
      message: buildOcrDraftCard({
        ocrId: "ocr_slip_300",
        merchantName: "สลิปโอนเงิน",
        amount: 30000,
        dateLabel: "วันนี้",
        needsSlipKind: true,
        appOrigin,
      }),
    },
    {
      id: "c16d-bill-due",
      batch: "C4",
      code: "C-16d (บิล)",
      title: "เตือนบิลใกล้ถึงกำหนด (ค่าหอพรุ่งนี้)",
      message: buildBillOrPaydayAlertCard({
        kind: "bill_due",
        alertId: "bill_dorm_1",
        title: "ค่าหอ",
        amount: 40000,
        appOrigin,
      }),
    },
    {
      id: "c16d-payday-delayed",
      batch: "C4",
      code: "C-16d (เงินเข้าช้า)",
      title: "เตือนวันรับเงินเลื่อน (ช้า 2 วัน)",
      message: buildBillOrPaydayAlertCard({
        kind: "payday_delayed",
        alertId: "payday_delay_2d",
        title: "วันรับเงินเลื่อน",
        delayedDays: 2,
        appOrigin,
      }),
    },
    {
      id: "c19-promo-link",
      batch: "C4",
      code: "C-19",
      title: "ถามโปรร้านค้า → การ์ดลิงก์เปิดหน้าสิทธิพิเศษ (ไม่มีชื่อร้าน/ราคาในแชต)",
      userPrompt: "มีโปรไหม",
      message: buildPromoLinkMessage(appOrigin),
    },
    {
      id: "c20-points-link",
      batch: "C4",
      code: "C-20",
      title: "ถามแต้ม/แลกของ → การ์ดลิงก์เปิดแอป",
      userPrompt: "แต้ม",
      message: buildPointsLinkMessage(appOrigin),
    },
  ];
}
