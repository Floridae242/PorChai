import {
  bahtText,
  FLEX_COLORS,
  formatBaht,
  mascotPngUrl,
  miniAppUrl,
} from "../format";
import { encodePostback } from "../postback";
import type {
  BalanceAdjustAskViewModel,
  FlexMessage,
  HowToRecordCardViewModel,
  SavingsStatusCardViewModel,
  TodayBudgetCardViewModel,
  WelcomeCardViewModel,
} from "../types";

/**
 * C-1: Welcome card when adding OA as friend.
 * Blends our soft header with Figma C-1's 3 horizontal step circles and URI button.
 */
export function buildWelcomeCard(vm: WelcomeCardViewModel = {}): FlexMessage {
  return {
    type: "flex",
    altText: "สวัสดีครับ ฉันคือพอใช้ ก่อนเริ่มใช้ ตั้งค่าในแอปประมาณ 2 นาทีนะครับ",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: FLEX_COLORS.lime100,
        contents: [
          {
            type: "image",
            url: mascotPngUrl("greeting", vm.appOrigin),
            size: "xxs",
            aspectRatio: "1:1",
            aspectMode: "fit",
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              {
                type: "text",
                text: "สวัสดีครับ ฉันคือพอใช้",
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: "ก่อนเริ่มใช้ ตั้งค่าที่แอปก่อน (ประมาณ 2 นาที)",
                size: "xxs",
                color: FLEX_COLORS.sage500,
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: FLEX_COLORS.white,
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "ช่วยบอกว่าวันนี้ใช้ได้เท่าไหร่ และลองก่อนจ่ายให้ดูว่าซื้อแล้วเหลือวันละเท่าไหร่ครับ",
            size: "xs",
            color: FLEX_COLORS.green900,
            wrap: true,
          },
          {
            type: "box",
            layout: "horizontal",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "10px",
            paddingAll: "12px",
            spacing: "sm",
            margin: "sm",
            contents: [
              {
                type: "box",
                layout: "vertical",
                alignItems: "center",
                flex: 1,
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: FLEX_COLORS.lime100,
                    cornerRadius: "12px",
                    width: "24px",
                    height: "24px",
                    alignItems: "center",
                    justifyContent: "center",
                    contents: [
                      {
                        type: "text",
                        text: "1",
                        size: "xs",
                        weight: "bold",
                        color: FLEX_COLORS.green800,
                        align: "center",
                      },
                    ],
                  },
                  {
                    type: "text",
                    text: "ยินยอมข้อมูล",
                    size: "xxs",
                    weight: "bold",
                    color: FLEX_COLORS.green900,
                    align: "center",
                    margin: "xs",
                    wrap: true,
                  },
                ],
              },
              {
                type: "box",
                layout: "vertical",
                alignItems: "center",
                flex: 1,
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: FLEX_COLORS.lime100,
                    cornerRadius: "12px",
                    width: "24px",
                    height: "24px",
                    alignItems: "center",
                    justifyContent: "center",
                    contents: [
                      {
                        type: "text",
                        text: "2",
                        size: "xs",
                        weight: "bold",
                        color: FLEX_COLORS.green800,
                        align: "center",
                      },
                    ],
                  },
                  {
                    type: "text",
                    text: "ตั้งรอบเงิน",
                    size: "xxs",
                    weight: "bold",
                    color: FLEX_COLORS.green900,
                    align: "center",
                    margin: "xs",
                    wrap: true,
                  },
                ],
              },
              {
                type: "box",
                layout: "vertical",
                alignItems: "center",
                flex: 1,
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: FLEX_COLORS.lime100,
                    cornerRadius: "12px",
                    width: "24px",
                    height: "24px",
                    alignItems: "center",
                    justifyContent: "center",
                    contents: [
                      {
                        type: "text",
                        text: "3",
                        size: "xs",
                        weight: "bold",
                        color: FLEX_COLORS.green800,
                        align: "center",
                      },
                    ],
                  },
                  {
                    type: "text",
                    text: "ใส่เงินที่มี",
                    size: "xxs",
                    weight: "bold",
                    color: FLEX_COLORS.green900,
                    align: "center",
                    margin: "xs",
                    wrap: true,
                  },
                ],
              },
            ],
          },
          {
            type: "text",
            text: "ตั้งค่าเสร็จแล้วค่อยพิมพ์จดได้เลยครับ",
            size: "xxs",
            color: FLEX_COLORS.sage500,
            margin: "xs",
            align: "center",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "button",
            style: "primary",
            color: FLEX_COLORS.green800,
            height: "sm",
            action: {
              type: "uri",
              label: "เริ่มตั้งค่า ↗",
              uri: miniAppUrl("/app/consent", vm.appOrigin),
            },
          },
        ],
      },
    },
  };
}

/**
 * C-5: Today's Budget Card ("วันนี้ใช้ได้เท่าไหร่").
 */
export function buildTodayBudgetCard(vm: TodayBudgetCardViewModel): FlexMessage {
  const isOver = vm.todayRemaining < 0;
  const overAmount = isOver ? -vm.todayRemaining : 0;
  const pose = isOver ? "budgetTight" : "budgetOk";
  const pct =
    vm.dailyBudget > 0
      ? Math.min(100, Math.max(0, Math.round((vm.spentToday / vm.dailyBudget) * 100)))
      : 100;

  return {
    type: "flex",
    altText: isOver
      ? `วันนี้เกินงบ ${bahtText(overAmount)}`
      : `วันนี้ใช้ได้อีก ${bahtText(vm.todayRemaining)}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: isOver ? FLEX_COLORS.amber50 : FLEX_COLORS.lime100,
        contents: [
          {
            type: "image",
            url: mascotPngUrl(pose, vm.appOrigin),
            size: "xxs",
            aspectRatio: "1:1",
            aspectMode: "fit",
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              {
                type: "text",
                text: "เหลือใช้วันนี้",
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: `อีก ${vm.daysRemaining} วันถึงวันรับเงิน`,
                size: "xxs",
                color: FLEX_COLORS.sage500,
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: isOver ? FLEX_COLORS.red50 : FLEX_COLORS.lime50,
            cornerRadius: "12px",
            paddingAll: "14px",
            contents: [
              {
                type: "text",
                text: isOver ? "เกินงบวันนี้" : "วันนี้ใช้ได้อีก",
                size: "xs",
                color: isOver ? FLEX_COLORS.red600 : FLEX_COLORS.sage500,
              },
              {
                type: "text",
                text: isOver ? bahtText(overAmount) : bahtText(vm.todayRemaining),
                size: "xxl",
                weight: "bold",
                color: isOver ? FLEX_COLORS.red600 : FLEX_COLORS.green900,
                margin: "xs",
              },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: FLEX_COLORS.line200,
                cornerRadius: "3px",
                height: "6px",
                margin: "sm",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: isOver ? FLEX_COLORS.red600 : FLEX_COLORS.green500,
                    height: "6px",
                    cornerRadius: "3px",
                    flex: Math.max(1, pct),
                    contents: [],
                  },
                  ...(100 - pct > 0 && !isOver
                    ? [
                        {
                          type: "box" as const,
                          layout: "vertical" as const,
                          backgroundColor: FLEX_COLORS.line200,
                          height: "6px",
                          cornerRadius: "3px",
                          flex: 100 - pct,
                          contents: [],
                        },
                      ]
                    : []),
                ],
              },
              {
                type: "text",
                text: `ใช้ไปแล้ว ${formatBaht(vm.spentToday)} จาก ${bahtText(vm.dailyBudget)}`,
                size: "xs",
                color: FLEX_COLORS.sage500,
                margin: "xs",
              },
            ],
          },
          {
            type: "text",
            text: `ใช้ได้ ${formatBaht(vm.disposablePool)} ÷ ${vm.daysRemaining} วัน · กันออม ${formatBaht(vm.savingsReserved)} · เผื่อ ${bahtText(vm.bufferReserved)}`,
            size: "xxs",
            color: FLEX_COLORS.sage500,
            margin: "md",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "button",
            style: "primary",
            color: FLEX_COLORS.green800,
            height: "sm",
            flex: 1,
            action: {
              type: "uri",
              label: "เปิดแผน",
              uri: miniAppUrl("/app", vm.appOrigin),
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "ลองก่อนจ่าย",
              data: encodePostback("menu_try", "today_card"),
              displayText: "ลองก่อนจ่าย",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "จดรายการ",
              data: encodePostback("menu_record", "today_card"),
              displayText: "วิธีจดรายการ",
            },
          },
        ],
      },
    },
  };
}

/**
 * C-14: How to Record Tutorial Card ("จดง่าย ๆ ใน 3 แบบ").
 * Matches Figma C-14: 3 example blocks + orange disclaimer box + quick replies.
 */
export function buildHowToRecordCard(vm: HowToRecordCardViewModel = {}): FlexMessage {
  return {
    type: "flex",
    altText: "จดง่าย ๆ ใน 3 แบบ: รายจ่าย (ข้าว 45), รายรับ (รับ 500), หลายรายการแยกบรรทัด",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: FLEX_COLORS.lime100,
        contents: [
          {
            type: "image",
            url: mascotPngUrl("greeting", vm.appOrigin),
            size: "xxs",
            aspectRatio: "1:1",
            aspectMode: "fit",
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              {
                type: "text",
                text: "จดง่าย ๆ ใน 3 แบบ",
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: "พิมพ์ในช่องแชตด้านล่างได้เลยครับ",
                size: "xxs",
                color: FLEX_COLORS.sage500,
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: FLEX_COLORS.white,
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "10px",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: "1 · รายจ่าย: ชื่อ + จำนวนเงิน",
                size: "xs",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: "คุณพิมพ์: ข้าว 45 → พอใช้: จดแล้ว ✓ วันนี้ใช้ได้อีก 75 บาท",
                size: "xxs",
                color: FLEX_COLORS.sage500,
                margin: "xs",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "10px",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: "2 · รายรับ: รับ + จำนวนเงิน",
                size: "xs",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: "คุณพิมพ์: รับ 500 → พอใช้: จดแล้ว ✓ เงินเข้า +500 บาท",
                size: "xxs",
                color: FLEX_COLORS.sage500,
                margin: "xs",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "10px",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: "3 · หลายรายการ: พิมพ์แยกบรรทัด",
                size: "xs",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: "คุณพิมพ์: ข้าว 45 / กาแฟ 55 → พอใช้: จดแล้ว 2 รายการ รวม 100 บาท",
                size: "xxs",
                color: FLEX_COLORS.sage500,
                margin: "xs",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: FLEX_COLORS.amber50,
            cornerRadius: "8px",
            paddingAll: "8px",
            margin: "xs",
            contents: [
              {
                type: "text",
                text: "ตัวอย่างด้านบนเป็นภาพประกอบ ของจริงในแชตจะเป็นการ์ดคำนวณจากยอดของคุณ",
                size: "xxs",
                color: FLEX_COLORS.amber600,
                wrap: true,
              },
            ],
          },
          {
            type: "text",
            text: "ลืมจด? พิมพ์ 'เมื่อวาน ข้าว 45' · พิมพ์ผิดกดแก้/ลบได้",
            size: "xxs",
            color: FLEX_COLORS.sage500,
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "button",
            style: "primary",
            color: FLEX_COLORS.green800,
            height: "sm",
            flex: 1,
            action: {
              type: "uri",
              label: "กรอกในแอป",
              uri: miniAppUrl("/app/record", vm.appOrigin),
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "ลองก่อนจ่าย",
              data: encodePostback("menu_try", "howto_card"),
              displayText: "ลองก่อนจ่าย",
            },
          },
        ],
      },
    },
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "ลองก่อนจ่าย",
            data: encodePostback("menu_try", "howto_quick"),
            displayText: "ลองก่อนจ่าย",
          },
        },
        {
          type: "action",
          action: {
            type: "postback",
            label: "วันนี้ใช้ได้",
            data: encodePostback("menu_today", "howto_quick"),
            displayText: "วันนี้ใช้ได้เท่าไหร่",
          },
        },
      ],
    },
  };
}

/**
 * C-10: Adjust Actual Balance confirmation card ("เงินจริง 2,350").
 * Upgraded to a full Flex Card matching Figma C-10 with 3 comparison rows.
 */
export function buildBalanceAdjustAskMessage(
  vm: BalanceAdjustAskViewModel,
): FlexMessage {
  const bills = vm.billsReserved ?? 60000;
  const beforeDaily = vm.beforeDaily ?? 12000;
  const afterDaily = vm.afterDaily ?? 11500;
  const isDecrease = vm.actualBalance < vm.systemBalance;
  const diffSign = isDecrease ? "-" : "+";

  return {
    type: "flex",
    altText: `ปรับยอดให้ตรงเงินจริง: ในระบบ ${bahtText(vm.systemBalance)} → เงินจริง ${bahtText(vm.actualBalance)}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: FLEX_COLORS.lime100,
        contents: [
          {
            type: "image",
            url: mascotPngUrl("thinking"),
            size: "xxs",
            aspectRatio: "1:1",
            aspectMode: "fit",
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              {
                type: "text",
                text: "ปรับยอดให้ตรงเงินจริง",
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: `ในระบบ ${bahtText(vm.systemBalance)} · เงินจริงของคุณ ${formatBaht(vm.actualBalance)}`,
                size: "xxs",
                color: FLEX_COLORS.sage500,
                wrap: true,
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: FLEX_COLORS.white,
        spacing: "xs",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            justifyContent: "space-between",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: "เงินที่มี",
                size: "xs",
                color: FLEX_COLORS.sage500,
                flex: 1,
              },
              {
                type: "text",
                text: `${formatBaht(vm.actualBalance)} (${diffSign}${formatBaht(vm.diffAmount)})`,
                size: "xs",
                weight: "bold",
                color: FLEX_COLORS.green900,
                align: "end",
                flex: 0,
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            justifyContent: "space-between",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: "กันบิลไว้",
                size: "xs",
                color: FLEX_COLORS.sage500,
                flex: 1,
              },
              {
                type: "text",
                text: `${formatBaht(bills)} (เท่าเดิม)`,
                size: "xs",
                weight: "bold",
                color: FLEX_COLORS.green900,
                align: "end",
                flex: 0,
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            justifyContent: "space-between",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "8px",
            paddingAll: "10px",
            contents: [
              {
                type: "text",
                text: "วันนี้ใช้ได้",
                size: "xs",
                color: FLEX_COLORS.sage500,
                flex: 1,
              },
              {
                type: "text",
                text: `${formatBaht(beforeDaily)} → ${bahtText(afterDaily)}`,
                size: "xs",
                weight: "bold",
                color: FLEX_COLORS.green800,
                align: "end",
                flex: 0,
              },
            ],
          },
          {
            type: "text",
            text: `ต่างกัน ${bahtText(vm.diffAmount)} จะปรับเป็น ${bahtText(vm.actualBalance)} เลยไหมครับ? ยอดนี้มีผลทันที`,
            size: "xxs",
            color: FLEX_COLORS.sage500,
            margin: "sm",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "button",
            style: "primary",
            color: FLEX_COLORS.green800,
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "ยืนยันปรับยอด",
              data: encodePostback("bal_adjust_ok", vm.requestId),
              displayText: "ยืนยันปรับยอด",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "ไม่ปรับ",
              data: encodePostback("bal_adjust_no", vm.requestId),
              displayText: "ไม่ปรับ",
            },
          },
        ],
      },
    },
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "ดูวันนี้ใช้ได้",
            data: encodePostback("menu_today", "bal_adjust"),
            displayText: "วันนี้ใช้ได้เท่าไหร่",
          },
        },
      ],
    },
  };
}

/**
 * C-15: Savings & Buffer Status Card ("ออมเท่าไหร่แล้ว").
 * Matches Figma C-15: "เงินออม + เงินเผื่อรอบนี้", 240 บาท · ออมแล้ว 10%, 3 buttons.
 */
export function buildSavingsStatusCard(vm: SavingsStatusCardViewModel): FlexMessage {
  return {
    type: "flex",
    altText: `เงินออม + เงินเผื่อรอบนี้: ${bahtText(vm.savingsAmount)} (ออมแล้ว ${vm.savingsPercent}%)`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: FLEX_COLORS.lime100,
        contents: [
          {
            type: "image",
            url: mascotPngUrl("saveCoins", vm.appOrigin),
            size: "xxs",
            aspectRatio: "1:1",
            aspectMode: "fit",
          },
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              {
                type: "text",
                text: "เงินออม + เงินเผื่อรอบนี้",
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: "หักไว้ตั้งแต่ต้นรอบ · ไม่นับในงบใช้จ่าย",
                size: "xxs",
                color: FLEX_COLORS.sage500,
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "12px",
            paddingAll: "14px",
            contents: [
              {
                type: "text",
                text: `${bahtText(vm.savingsAmount)} · ออมแล้ว ${vm.savingsPercent}%`,
                size: "xl",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: FLEX_COLORS.line200,
                cornerRadius: "3px",
                height: "6px",
                margin: "sm",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: FLEX_COLORS.green500,
                    height: "6px",
                    cornerRadius: "3px",
                    flex: Math.max(1, Math.min(100, vm.savingsPercent * 5)),
                    contents: [],
                  },
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: FLEX_COLORS.line200,
                    height: "6px",
                    cornerRadius: "3px",
                    flex: Math.max(1, 100 - Math.min(100, vm.savingsPercent * 5)),
                    contents: [],
                  },
                ],
              },
              {
                type: "text",
                text: `เงินเผื่อ ${bahtText(vm.bufferAmount)} · ถ้าใช้ไปแล้ว กด 'ปรับยอดเงินจริง'`,
                size: "xs",
                color: FLEX_COLORS.sage500,
                margin: "xs",
                wrap: true,
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "uri",
              label: "ปรับเป้าออม",
              uri: miniAppUrl("/app/settings/savings", vm.appOrigin),
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "ปรับยอดเงินจริง",
              data: encodePostback("bal_adjust_ask", "savings_card"),
              displayText: "ปรับยอดเงินจริง",
            },
          },
          {
            type: "button",
            style: "primary",
            color: FLEX_COLORS.green800,
            height: "sm",
            flex: 1,
            action: {
              type: "uri",
              label: "เปิดแผน",
              uri: miniAppUrl("/app/plan", vm.appOrigin),
            },
          },
        ],
      },
    },
  };
}

/**
 * Rich Menu 5-button layout definition (2500x1686 grid: 3 cols x 2 rows).
 * Every chat-action button uses `postback` (never plain text) to prevent E-26.
 */
export function buildRichMenuSpec(appOrigin?: string) {
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "PorChai Main Menu v1",
    chatBarText: "เมนูพอใช้",
    areas: [
      {
        // Top-left (2 columns wide): จดรายรับ/จ่าย
        bounds: { x: 0, y: 0, width: 1667, height: 843 },
        action: {
          type: "postback" as const,
          label: "จดรายรับ/จ่าย",
          data: encodePostback("menu_record", "richmenu"),
          displayText: "วิธีจดรายรับ/จ่าย",
        },
      },
      {
        // Top-right (1 column wide): ลองก่อนจ่าย (ถาม AI ได้)
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: {
          type: "postback" as const,
          label: "ลองก่อนจ่าย",
          data: encodePostback("menu_try", "richmenu"),
          displayText: "ลองก่อนจ่าย",
        },
      },
      {
        // Bottom-left: วันนี้ใช้ได้
        bounds: { x: 0, y: 843, width: 833, height: 843 },
        action: {
          type: "postback" as const,
          label: "วันนี้ใช้ได้",
          data: encodePostback("menu_today", "richmenu"),
          displayText: "วันนี้ใช้ได้เท่าไหร่",
        },
      },
      {
        // Bottom-center: สิทธิพิเศษ & แต้ม (opens MINI App /app/perks)
        bounds: { x: 833, y: 843, width: 834, height: 843 },
        action: {
          type: "uri" as const,
          label: "สิทธิพิเศษ & แต้ม",
          uri: miniAppUrl("/app/perks", appOrigin),
        },
      },
      {
        // Bottom-right: เปิดแอป (opens MINI App /app)
        bounds: { x: 1667, y: 843, width: 833, height: 843 },
        action: {
          type: "uri" as const,
          label: "เปิดแอป",
          uri: miniAppUrl("/app", appOrigin),
        },
      },
    ],
  };
}
