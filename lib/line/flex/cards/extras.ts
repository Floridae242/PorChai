import {
  bahtText,
  FLEX_COLORS,
  formatBaht,
  mascotPngUrl,
  miniAppUrl,
} from "../format";
import { encodePostback } from "../postback";
import type {
  BillOrPaydayAlertViewModel,
  FlexAction,
  FlexMessage,
  FlexNode,
  OcrDraftCardViewModel,
} from "../types";

/**
 * C-17 / C-17b: OCR Slip/Receipt Draft Card.
 * Blends our soft header with Figma C-17's 3-row table (ร้าน / ยอดรวม / วันที่)
 * and never saves automatically — user must confirm [บันทึก] [แก้ยอด] [ยกเลิก] or select slip type.
 */
export function buildOcrDraftCard(vm: OcrDraftCardViewModel): FlexMessage {
  const bodyContents: FlexNode[] = [
    {
      type: "box",
      layout: "vertical",
      backgroundColor: FLEX_COLORS.lime50,
      cornerRadius: "10px",
      paddingAll: "12px",
      spacing: "xs",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          justifyContent: "space-between",
          contents: [
            {
              type: "text",
              text: "ร้าน",
              size: "xs",
              color: FLEX_COLORS.sage500,
              flex: 1,
            },
            {
              type: "text",
              text: vm.merchantName,
              size: "xs",
              weight: "bold",
              color: FLEX_COLORS.green900,
              align: "end",
              flex: 2,
              wrap: true,
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          justifyContent: "space-between",
          contents: [
            {
              type: "text",
              text: "ยอดรวม",
              size: "xs",
              color: FLEX_COLORS.sage500,
              flex: 1,
            },
            {
              type: "text",
              text: bahtText(vm.amount),
              size: "sm",
              weight: "bold",
              color: FLEX_COLORS.green800,
              align: "end",
              flex: 0,
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          justifyContent: "space-between",
          contents: [
            {
              type: "text",
              text: "วันที่",
              size: "xs",
              color: FLEX_COLORS.sage500,
              flex: 1,
            },
            {
              type: "text",
              text: vm.dateLabel,
              size: "xs",
              weight: "bold",
              color: FLEX_COLORS.green900,
              align: "end",
              flex: 0,
            },
          ],
        },
      ],
    },
    {
      type: "text",
      text: "ยังไม่บันทึก ตรวจให้ถูกแล้วกดบันทึกนะครับ",
      size: "xxs",
      color: FLEX_COLORS.sage500,
      margin: "sm",
      wrap: true,
    },
  ];

  if (vm.duplicateEntry) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: FLEX_COLORS.amber50,
      cornerRadius: "8px",
      paddingAll: "10px",
      margin: "sm",
      contents: [
        {
          type: "text",
          text: `รายการนี้คล้าย '${vm.duplicateEntry.title} ${formatBaht(vm.duplicateEntry.amount)}' ที่จดไว้ ${vm.duplicateEntry.timeLabel} ครับ`,
          size: "xs",
          weight: "bold",
          color: FLEX_COLORS.amber600,
          wrap: true,
        },
      ],
    });
  }

  if (vm.needsSlipKind) {
    bodyContents.push({
      type: "text",
      text: `สลิปนี้ ${bahtText(vm.amount)} เป็นแบบไหนครับ? (โอนระหว่างบัญชีตัวเองจะไม่นับเป็นรายจ่าย)`,
      size: "xs",
      weight: "bold",
      color: FLEX_COLORS.amber600,
      margin: "sm",
      wrap: true,
    });
  }

  // Max 3 buttons in card footer
  const footerButtons = vm.needsSlipKind
    ? [
        {
          type: "button" as const,
          style: "primary" as const,
          color: FLEX_COLORS.green800,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "รายจ่าย",
            data: encodePostback("ocr_kind_expense", vm.ocrId),
            displayText: "บันทึกเป็นรายจ่าย",
          },
        },
        {
          type: "button" as const,
          style: "secondary" as const,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "รับเงิน",
            data: encodePostback("ocr_kind_income", vm.ocrId),
            displayText: "บันทึกเป็นรายรับ",
          },
        },
        {
          type: "button" as const,
          style: "secondary" as const,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "โอนระหว่างบัญชี",
            data: encodePostback("ocr_kind_transfer", vm.ocrId),
            displayText: "โอนระหว่างบัญชี",
          },
        },
      ]
    : [
        {
          type: "button" as const,
          style: "primary" as const,
          color: FLEX_COLORS.green800,
          height: "sm" as const,
          flex: 1,
          action: {
            type: "postback" as const,
            label: "บันทึก",
            data: encodePostback("ocr_save", vm.ocrId),
            displayText: "บันทึกรายการ",
          },
        },
        {
          type: "button" as const,
          style: "secondary" as const,
          height: "sm" as const,
          flex: 1,
          action: {
            type: "postback" as const,
            label: "แก้ยอด",
            data: encodePostback("ocr_edit", vm.ocrId),
            displayText: "แก้ยอด",
          },
        },
        {
          type: "button" as const,
          style: "secondary" as const,
          height: "sm" as const,
          flex: 1,
          action: {
            type: "postback" as const,
            label: "ยกเลิก",
            data: encodePostback("ocr_cancel", vm.ocrId),
            displayText: "ยกเลิก",
          },
        },
      ];

  const quickActions: FlexAction[] = [];
  if (vm.candidateAmounts && vm.candidateAmounts.length > 0) {
    for (const amt of vm.candidateAmounts.slice(0, 4)) {
      quickActions.push({
        type: "postback",
        label: `ยอด ${bahtText(amt)}`,
        data: encodePostback("ocr_pick_amount", vm.ocrId, String(amt)),
        displayText: `เลือกยอด ${bahtText(amt)}`,
      });
    }
  }
  if (vm.duplicateEntry) {
    quickActions.push({
      type: "uri",
      label: "เปิดรายการเดิม",
      uri: miniAppUrl("/app/plan", vm.appOrigin),
    });
  }

  return {
    type: "flex",
    altText: `อ่านใบเสร็จแล้ว · รายการร่าง: ${vm.merchantName} ${bahtText(vm.amount)}`,
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
            url: mascotPngUrl("scanReceipt", vm.appOrigin),
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
                text: "อ่านใบเสร็จแล้ว · รายการร่าง",
                size: "sm",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: "กรุณาตรวจความถูกต้องก่อนบันทึก",
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
        contents: bodyContents,
      },
      footer: {
        type: "box",
        layout: vm.needsSlipKind ? "vertical" : "horizontal",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: FLEX_COLORS.white,
        contents: footerButtons,
      },
    },
    ...(quickActions.length > 0
      ? {
          quickReply: {
            items: quickActions.map((action) => ({ type: "action", action })),
          },
        }
      : {}),
  };
}

/**
 * C-16d: Bill Due Tomorrow or Delayed Payday Alert Card.
 */
export function buildBillOrPaydayAlertCard(vm: BillOrPaydayAlertViewModel): FlexMessage {
  if (vm.kind === "payday_delayed") {
    const days = vm.delayedDays ?? 2;
    return {
      type: "flex",
      altText: `เงินจะเข้าช้ากว่าเดิม ${days} วัน ต้องการดูงบต่อวันที่คำนวณใหม่ไหมครับ`,
      contents: {
        type: "bubble",
        size: "mega",
        header: {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          spacing: "sm",
          paddingAll: "14px",
          backgroundColor: FLEX_COLORS.amber50,
          contents: [
            {
              type: "image",
              url: mascotPngUrl("reminder", vm.appOrigin),
              size: "xxs",
              aspectRatio: "1:1",
              aspectMode: "fit",
            },
            {
              type: "text",
              text: "เตือนวันรับเงินเลื่อน",
              size: "sm",
              weight: "bold",
              color: FLEX_COLORS.amber600,
              flex: 1,
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
              type: "text",
              text: `เงินจะเข้าอีก ${days} วันจากเดิม ต้องการดูงบต่อวันที่คำนวณใหม่ไหมครับ?`,
              size: "sm",
              color: FLEX_COLORS.green900,
              wrap: true,
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
                label: "ดูแผนใหม่",
                uri: miniAppUrl("/app/plan/adjust", vm.appOrigin),
              },
            },
          ],
        },
      },
    };
  }

  // kind === "bill_due"
  const amtText = vm.amount !== undefined ? ` (${bahtText(vm.amount)})` : "";
  return {
    type: "flex",
    altText: `${vm.title}${amtText} ครบกำหนดพรุ่งนี้ เช็กเงินที่กันไว้ได้เลยครับ`,
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
            url: mascotPngUrl("reminder", vm.appOrigin),
            size: "xxs",
            aspectRatio: "1:1",
            aspectMode: "fit",
          },
          {
            type: "text",
            text: "เตือนบิลใกล้ถึงกำหนด",
            size: "sm",
            weight: "bold",
            color: FLEX_COLORS.green900,
            flex: 1,
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
            type: "text",
            text: `${vm.title}${amtText} ครบกำหนดพรุ่งนี้ เช็กเงินที่กันไว้ได้เลยครับ`,
            size: "sm",
            color: FLEX_COLORS.green900,
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
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "uri",
              label: "ดูบิล",
              uri: miniAppUrl("/app/settings/bills", vm.appOrigin),
            },
          },
          {
            type: "button",
            style: "primary",
            color: FLEX_COLORS.green800,
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "จ่ายแล้ว",
              data: encodePostback("bill_paid", vm.alertId),
              displayText: "จ่ายบิลแล้ว",
            },
          },
        ],
      },
    },
  };
}

/**
 * C-19: Promo Link Card ("มีโปรไหม").
 * Matches Figma C-19: Flex Card with single button [เปิดหน้าสิทธิพิเศษ].
 * Strictly NO shop name, price, or discount in the chat message per LINE policy.
 */
export function buildPromoLinkMessage(appOrigin?: string): FlexMessage {
  return {
    type: "flex",
    altText: "ดูสิทธิพิเศษและโปรที่เหมาะกับงบของคุณได้ในแอป",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "text",
            text: "ดูสิทธิพิเศษและโปรที่เหมาะกับงบของคุณได้ในแอปครับ",
            size: "sm",
            color: FLEX_COLORS.green900,
            wrap: true,
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
              label: "เปิดหน้าสิทธิพิเศษ",
              uri: miniAppUrl("/app/perks", appOrigin),
            },
          },
        ],
      },
    },
  };
}

/**
 * C-20: Points & Rewards Link Card ("แต้ม").
 * Matches Figma C-19 right column: Flex Card with single button [เปิดแอป].
 * Strictly NO reward names or promotional copy in the chat message.
 */
export function buildPointsLinkMessage(appOrigin?: string): FlexMessage {
  return {
    type: "flex",
    altText: "เช็กแผนรายวันเพื่อรับแต้มฟรี และดูแต้มสะสมได้ในแอปครับ",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "text",
            text: "เช็กแผนรายวันเพื่อรับแต้มฟรี และดูแต้มสะสมได้ในแอปครับ",
            size: "sm",
            color: FLEX_COLORS.green900,
            wrap: true,
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
              label: "เปิดแอป",
              uri: miniAppUrl("/app/points", appOrigin),
            },
          },
        ],
      },
    },
  };
}
