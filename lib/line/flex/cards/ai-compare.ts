import {
  bahtText,
  FLEX_COLORS,
  formatBaht,
  mascotPngUrl,
  miniAppUrl,
} from "../format";
import { encodePostback } from "../postback";
import type {
  AiCompareCardViewModel,
  AskDateViewModel,
  FlexAction,
  FlexMessage,
  FlexNode,
  TextReplyMessage,
  TryBeforeBuyCardViewModel,
} from "../types";

/**
 * C-18: Ask AI Before Paying comparison card.
 * Blends our soft header with Figma C-18's 3-row table (ราคา / ซื้อเพิ่มได้ไม่เกิน / ผล),
 * explanation copy, and promo note.
 * Max 3 buttons in card footer: [เก็บไว้ในแผน] [ยืนยันจ่ายจริง] [ลองยอดอื่น]
 * Overflow actions go into quickReply: [ดูเปรียบเทียบเต็ม] and optional [ดูโปรที่ใช้ได้].
 */
export function buildAiCompareCard(vm: AiCompareCardViewModel): FlexMessage {
  const isOver = vm.overBy > 0;
  const pose = isOver ? "budgetTight" : "thinking";

  const statusHeading = isOver
    ? `เกินงบ ${bahtText(vm.overBy)}`
    : `อยู่ในงบ · เหลือวันละ ${bahtText(vm.afterDaily)}`;

  const defaultExplanation =
    isOver && vm.maxSpendable !== null
      ? `ค่าเดินทางและเงินออมยังกันไว้ครบ แต่ถ้าจ่าย ${formatBaht(vm.amount)} จะเกินที่ใช้เพิ่มได้ ${bahtText(vm.overBy)} ทางเลือกคือเลื่อนนัด หรือเลือกร้านที่ไม่เกิน ${bahtText(vm.maxSpendable)}`
      : `ถ้าซื้อ เหลือใช้วันละ ${bahtText(vm.afterDaily)} (ไม่ซื้อ คงวันละ ${bahtText(vm.beforeDaily)})`;

  const subnote = vm.hasMatchingPromo
    ? `มีโปรที่ใช้ได้${vm.dueLabel}ในหน้าสิทธิพิเศษ · ตัวเลขคำนวณจากแผนของคุณ AI ช่วยอธิบายเท่านั้น`
    : "ตัวเลขคำนวณจากแผนของคุณ AI ช่วยอธิบายเท่านั้น";

  const bodyContents: FlexNode[] = [
    {
      type: "box",
      layout: "vertical",
      backgroundColor: isOver ? FLEX_COLORS.red50 : FLEX_COLORS.lime50,
      cornerRadius: "12px",
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
              text: "ราคา",
              size: "xs",
              color: FLEX_COLORS.sage500,
              flex: 1,
            },
            {
              type: "text",
              text: bahtText(vm.amount),
              size: "sm",
              weight: "bold",
              color: FLEX_COLORS.green900,
              align: "end",
              flex: 0,
            },
          ],
        },
        ...(vm.maxSpendable !== null
          ? [
              {
                type: "box" as const,
                layout: "horizontal" as const,
                justifyContent: "space-between" as const,
                contents: [
                  {
                    type: "text" as const,
                    text: "ซื้อเพิ่มได้ไม่เกิน",
                    size: "xs" as const,
                    color: FLEX_COLORS.sage500,
                    flex: 1,
                  },
                  {
                    type: "text" as const,
                    text: bahtText(vm.maxSpendable),
                    size: "sm" as const,
                    weight: "bold" as const,
                    color: FLEX_COLORS.green900,
                    align: "end" as const,
                    flex: 0,
                  },
                ],
              },
            ]
          : []),
        {
          type: "box",
          layout: "horizontal",
          justifyContent: "space-between",
          contents: [
            {
              type: "text",
              text: "ผล",
              size: "xs",
              color: FLEX_COLORS.sage500,
              flex: 1,
            },
            {
              type: "text",
              text: statusHeading,
              size: "sm",
              weight: "bold",
              color: isOver ? FLEX_COLORS.red600 : FLEX_COLORS.green800,
              align: "end",
              flex: 0,
            },
          ],
        },
      ],
    },
    { type: "separator", margin: "md", color: FLEX_COLORS.line200 },
    {
      type: "text",
      text: vm.explanation ?? defaultExplanation,
      size: "xs",
      color: FLEX_COLORS.green900,
      margin: "md",
      wrap: true,
    },
    {
      type: "text",
      text: subnote,
      size: "xxs",
      color: FLEX_COLORS.sage500,
      margin: "sm",
      wrap: true,
    },
  ];

  const quickActions: FlexAction[] = [
    {
      type: "uri",
      label: "ดูเปรียบเทียบเต็ม",
      uri: miniAppUrl("/app/try", vm.appOrigin),
    },
  ];

  // Policy: Never put shop name, price, or discount inside the chat message — link only!
  if (vm.hasMatchingPromo) {
    quickActions.push({
      type: "uri",
      label: "ดูโปรที่ใช้ได้",
      uri: miniAppUrl("/app/perks", vm.appOrigin),
    });
  }

  return {
    type: "flex",
    altText: `ลองก่อนจ่าย · ${vm.itemTitle} (${vm.dueLabel}) ${bahtText(vm.amount)} · ${statusHeading}`,
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
                text: `ลองก่อนจ่าย · ${vm.itemTitle} (${vm.dueLabel})`,
                size: "sm",
                weight: "bold",
                color: FLEX_COLORS.green900,
                wrap: true,
              },
              {
                type: "text",
                text: "ถาม AI ก่อนจ่าย · คำนวณจากแผนจริงของคุณ",
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
        layout: "vertical",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: FLEX_COLORS.white,
        contents: [
          {
            type: "button",
            style: "primary",
            color: FLEX_COLORS.green800,
            height: "sm",
            action: {
              type: "postback",
              label: "เก็บไว้ในแผน",
              data: encodePostback("keep_plan", vm.draftId),
              displayText: "เก็บไว้ในแผน",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "ยืนยันจ่ายจริง",
              data: encodePostback("pay_real", vm.draftId),
              displayText: "ยืนยันจ่ายจริง",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "ลองยอดอื่น",
              data: encodePostback("try_other", vm.draftId),
              displayText: "ลองยอดอื่น",
            },
          },
        ],
      },
    },
    quickReply: {
      items: quickActions.map((action) => ({ type: "action", action })),
    },
  };
}

/**
 * C-18b: Ask Date Before Calculating when user omits the date.
 */
export function buildAskDateMessage(vm: AskDateViewModel): TextReplyMessage {
  return {
    type: "text",
    text: `${vm.itemTitle} ${bahtText(vm.amount)} อยากไปวันไหนครับ จะได้เช็กว่าใช้งบวันนี้หรือหักจากวันถัดไป`,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "วันนี้",
            data: encodePostback("ask_date_today", vm.draftId),
            displayText: "วันนี้",
          },
        },
        {
          type: "action",
          action: {
            type: "postback",
            label: "พรุ่งนี้",
            data: encodePostback("ask_date_tomorrow", vm.draftId),
            displayText: "พรุ่งนี้",
          },
        },
        {
          type: "action",
          action: {
            type: "postback",
            label: "ศุกร์นี้",
            data: encodePostback("ask_date_fri", vm.draftId),
            displayText: "ศุกร์นี้",
          },
        },
      ],
    },
  };
}

/**
 * C-6 / C-6b / C-7: Try Before Paying card ("ลอง รองเท้า 480", "ซื้อ 250", or "ลอง มื้อนี้ 300").
 */
export function buildTryBeforeBuyCard(vm: TryBeforeBuyCardViewModel): FlexMessage {
  const overBy = vm.overBy ?? 0;
  const isOverLimit = overBy > 0;
  const pose = isOverLimit ? "budgetTight" : "thinking";
  const dailyDiff = Math.max(0, vm.beforeDaily - vm.afterDaily);

  const topLine =
    vm.maxSpendable !== undefined && vm.maxSpendable !== null
      ? `ปกติวันละ ${bahtText(vm.beforeDaily)} · ซื้อได้ไม่เกิน ${bahtText(vm.maxSpendable)}`
      : `ลดลง ${formatBaht(dailyDiff)} จากเดิม ${bahtText(vm.beforeDaily)}`;

  const impactLines: FlexNode[] = [
    ...(vm.billsTotal !== undefined
      ? [
          {
            type: "text" as const,
            text: `✓ บิล ${bahtText(vm.billsTotal)} ยังพอ`,
            size: "xxs" as const,
            color: FLEX_COLORS.green700,
          },
        ]
      : []),
    ...(vm.essentialsPerDay !== undefined && vm.essentialsPerDay !== null
      ? [
          {
            type: "text" as const,
            text: isOverLimit
              ? `⚠ ต่ำกว่าค่าจำเป็นที่ตั้งไว้ ${bahtText(vm.essentialsPerDay)}/วัน`
              : `✓ ค่าจำเป็น ${bahtText(vm.essentialsPerDay)}/วัน ยังพอ (เหลือ ${formatBaht(vm.afterDaily)})`,
            size: "xxs" as const,
            color: isOverLimit ? FLEX_COLORS.amber600 : FLEX_COLORS.green700,
            margin: "xs" as const,
          },
        ]
      : []),
    {
      type: "text",
      text: "✓ ออมและเงินเผื่อไม่ถูกแตะ",
      size: "xxs",
      color: FLEX_COLORS.green700,
      margin: "xs",
    },
  ];

  // C-7 (meal today) has no "เก็บไว้ในแผน", only [ยืนยันจ่ายจริง] [ลองยอดอื่น] [ไม่ซื้อ]
  const footerButtons = vm.isMealToday
    ? [
        {
          type: "button" as const,
          style: "primary" as const,
          color: FLEX_COLORS.green800,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "ยืนยันจ่ายจริง",
            data: encodePostback("pay_real", vm.draftId),
            displayText: "ยืนยันจ่ายจริง",
          },
        },
        {
          type: "button" as const,
          style: "secondary" as const,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "ลองยอดอื่น",
            data: encodePostback("try_other", vm.draftId),
            displayText: "ลองยอดอื่น",
          },
        },
        {
          type: "button" as const,
          style: "secondary" as const,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "ไม่ซื้อ",
            data: encodePostback("try_cancel", vm.draftId),
            displayText: "ไม่ซื้อ",
          },
        },
      ]
    : [
        {
          type: "button" as const,
          style: "primary" as const,
          color: FLEX_COLORS.green800,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "เก็บไว้ในแผน",
            data: encodePostback("keep_plan", vm.draftId),
            displayText: "เก็บไว้ในแผน",
          },
        },
        {
          type: "button" as const,
          style: "secondary" as const,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "ยืนยันจ่ายจริง",
            data: encodePostback("pay_real", vm.draftId),
            displayText: "ยืนยันจ่ายจริง",
          },
        },
        {
          type: "button" as const,
          style: "secondary" as const,
          height: "sm" as const,
          action: {
            type: "postback" as const,
            label: "เลื่อนไปรอบหน้า",
            data: encodePostback("postpone_next", vm.draftId),
            displayText: "เลื่อนไปรอบหน้า",
          },
        },
      ];

  return {
    type: "flex",
    altText: `ลองก่อนจ่าย ${vm.itemTitle} ${bahtText(vm.amount)} → เหลือวันละ ${bahtText(vm.afterDaily)}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: isOverLimit ? FLEX_COLORS.amber50 : FLEX_COLORS.lime100,
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
                text: `ลองก่อนจ่าย · ${vm.itemTitle} ${formatBaht(vm.amount)}`,
                size: "sm",
                weight: "bold",
                color: FLEX_COLORS.green900,
                wrap: true,
              },
              {
                type: "text",
                text: topLine,
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
        contents: [
          ...(isOverLimit
            ? [
                {
                  type: "text" as const,
                  text: `เกินวงเงิน ${bahtText(overBy)}`,
                  size: "md" as const,
                  weight: "bold" as const,
                  color: FLEX_COLORS.amber600,
                  margin: "none" as const,
                },
              ]
            : []),
          {
            type: "box",
            layout: "vertical",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "10px",
            paddingAll: "12px",
            margin: "xs",
            spacing: "xs",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                justifyContent: "space-between",
                contents: [
                  {
                    type: "text",
                    text: `ซื้อ ${formatBaht(vm.amount)}`,
                    size: "sm",
                    weight: "bold",
                    color: FLEX_COLORS.green900,
                    flex: 1,
                  },
                  {
                    type: "text",
                    text: `เหลือวันละ ${bahtText(vm.afterDaily)}`,
                    size: "sm",
                    weight: "bold",
                    color: isOverLimit ? FLEX_COLORS.amber600 : FLEX_COLORS.green800,
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
                    text: "ไม่ซื้อ / เลื่อน",
                    size: "xs",
                    color: FLEX_COLORS.sage500,
                    flex: 1,
                  },
                  {
                    type: "text",
                    text: `คงวันละ ${bahtText(vm.beforeDaily)}`,
                    size: "xs",
                    color: FLEX_COLORS.sage500,
                    align: "end",
                    flex: 0,
                  },
                ],
              },
            ],
          },
          ...(vm.formulaNote
            ? [
                {
                  type: "text" as const,
                  text: vm.formulaNote,
                  size: "xxs" as const,
                  color: FLEX_COLORS.sage500,
                  margin: "sm" as const,
                  wrap: true,
                },
              ]
            : []),
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            contents: impactLines,
          },
          {
            type: "text",
            text: "อยากลองราคาอื่น? พิมพ์บอกได้เลย เช่น 'ซื้อ 250'",
            size: "xxs",
            color: FLEX_COLORS.sage500,
            margin: "sm",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        paddingAll: "12px",
        backgroundColor: FLEX_COLORS.white,
        contents: footerButtons,
      },
    },
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "ไม่ซื้อ",
            data: encodePostback("try_cancel", vm.draftId),
            displayText: "ไม่ซื้อ",
          },
        },
        {
          type: "action",
          action: {
            type: "uri",
            label: "ดูเปรียบเทียบเต็ม",
            uri: miniAppUrl("/app/try", vm.appOrigin),
          },
        },
      ],
    },
  };
}
