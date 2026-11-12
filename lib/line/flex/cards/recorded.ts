import {
  bahtText,
  categoryLabel,
  FLEX_COLORS,
  formatBaht,
  mascotPngUrl,
  miniAppUrl,
} from "../format";
import { encodePostback } from "../postback";
import type {
  FlexAction,
  FlexBox,
  FlexButton,
  FlexMessage,
  FlexNode,
  RecordedCardViewModel,
} from "../types";

function progressPercent(spent: number, budget: number): number {
  if (budget <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((spent / budget) * 100)));
}

/**
 * Base "จดแล้ว ✓" Flex Card (reused across C-3, C-4, C-8, C-3b, C-16b, and C-16c).
 * Blends our soft colored header with Figma C-3's two-line item layout so neither
 * the right-aligned Baht amount nor the category pill ever clips on mobile screens.
 * Strictly max 3 buttons inside the card footer; additional actions go into quickReply.
 */
export function buildRecordedCard(vm: RecordedCardViewModel): FlexMessage {
  const isOver = vm.todayRemaining < 0;
  const overAmount = isOver ? -vm.todayRemaining : 0;
  const heading = vm.heading ?? "จดแล้ว ✓";
  const dateLabel = vm.dateLabel ?? "วันนี้";
  const pose = isOver ? "budgetTight" : "budgetOk";

  const itemRows: FlexNode[] = vm.items.map((item) => ({
    type: "box",
    layout: "vertical",
    margin: "sm",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        justifyContent: "space-between",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: item.title,
            size: "md",
            weight: "bold",
            color: FLEX_COLORS.green900,
            flex: 1,
            wrap: true,
          },
          {
            type: "text",
            text: bahtText(item.amount),
            size: "md",
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
        margin: "xs",
        contents: [
          {
            type: "box",
            layout: "vertical",
            backgroundColor: FLEX_COLORS.lime100,
            cornerRadius: "8px",
            paddingStart: "8px",
            paddingEnd: "8px",
            paddingTop: "2px",
            paddingBottom: "2px",
            flex: 0,
            contents: [
              {
                type: "text",
                text: categoryLabel(item.category),
                size: "xxs",
                weight: "bold",
                color: FLEX_COLORS.green800,
                align: "center",
              },
            ],
          },
        ],
      },
    ],
  }));

  if (vm.items.length > 1) {
    itemRows.push({
      type: "box",
      layout: "horizontal",
      justifyContent: "space-between",
      margin: "sm",
      contents: [
        {
          type: "text",
          text: `รวม ${vm.items.length} รายการ`,
          size: "xs",
          color: FLEX_COLORS.sage500,
          flex: 1,
        },
        {
          type: "text",
          text: bahtText(vm.totalAmount),
          size: "sm",
          weight: "bold",
          color: FLEX_COLORS.green900,
          align: "end",
          flex: 0,
        },
      ],
    });
  }

  const pct = progressPercent(vm.spentToday, vm.dailyBudget);
  const fillFlex = Math.max(1, pct);
  const remainFlex = Math.max(0, 100 - pct);

  const barContents: FlexNode[] = [
    {
      type: "box",
      layout: "vertical",
      backgroundColor: isOver ? FLEX_COLORS.red600 : FLEX_COLORS.green500,
      height: "6px",
      cornerRadius: "3px",
      flex: fillFlex,
      contents: [],
    },
  ];
  if (remainFlex > 0 && !isOver) {
    barContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: FLEX_COLORS.line200,
      height: "6px",
      cornerRadius: "3px",
      flex: remainFlex,
      contents: [],
    });
  }

  const heroBox: FlexBox = {
    type: "box",
    layout: "vertical",
    backgroundColor: isOver ? FLEX_COLORS.red50 : FLEX_COLORS.lime50,
    cornerRadius: "12px",
    paddingAll: "12px",
    margin: "md",
    contents: [
      {
        type: "text",
        text: isOver ? "วันนี้เกินงบ" : "วันนี้ใช้ได้อีก",
        size: "xs",
        color: isOver ? FLEX_COLORS.red600 : FLEX_COLORS.sage500,
      },
      {
        type: "text",
        text: isOver ? `เกินงบ ${bahtText(overAmount)}` : bahtText(vm.todayRemaining),
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
        contents: barContents,
      },
      {
        type: "text",
        text: `ใช้ไปแล้ว ${formatBaht(vm.spentToday)} / ${bahtText(vm.dailyBudget)}`,
        size: "xs",
        color: FLEX_COLORS.sage500,
        margin: "xs",
      },
      ...(isOver && vm.tomorrowDailyBudget !== undefined && vm.tomorrowDailyBudget !== null
        ? [
            {
              type: "text" as const,
              text: `พรุ่งนี้ใช้ได้ ${formatBaht(vm.dailyBudget)} → ${bahtText(vm.tomorrowDailyBudget)}/วัน`,
              size: "xs" as const,
              weight: "bold" as const,
              color: FLEX_COLORS.red600,
              margin: "sm" as const,
              wrap: true,
            },
          ]
        : []),
      ...(vm.subnote
        ? [
            {
              type: "text" as const,
              text: vm.subnote,
              size: "xxs" as const,
              color: FLEX_COLORS.sage500,
              margin: "xs" as const,
              wrap: true,
            },
          ]
        : []),
    ],
  };

  const bodyContents: FlexNode[] = [
    ...itemRows,
    { type: "separator", margin: "md", color: FLEX_COLORS.line200 },
    heroBox,
  ];

  if (vm.pendingItem) {
    bodyContents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: FLEX_COLORS.amber50,
      cornerRadius: "10px",
      paddingAll: "10px",
      margin: "md",
      contents: [
        {
          type: "text",
          text: `รอยืนยัน 1 รายการ: ${vm.pendingItem.title} ${bahtText(vm.pendingItem.amount)}`,
          size: "xs",
          weight: "bold",
          color: FLEX_COLORS.amber600,
          wrap: true,
        },
        {
          type: "text",
          text: "ยอดนี้สูงกว่างบวันนี้ ยืนยันจ่ายจริง หรืออยากลองก่อน?",
          size: "xxs",
          color: FLEX_COLORS.sage500,
          margin: "xs",
          wrap: true,
        },
      ],
    });
  }

  // Max 3 buttons in card footer per LINE Flex rules
  const footerButtons: FlexButton[] = vm.compactActions
    ? [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          flex: 1,
          action: {
            type: "postback",
            label: "แก้",
            data: encodePostback("entry_edit", vm.entryId),
            displayText: "แก้รายการ",
          },
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          flex: 1,
          action: {
            type: "postback",
            label: "ลบ",
            data: encodePostback("entry_del", vm.entryId),
            displayText: "ลบรายการ",
          },
        },
      ]
    : vm.isBackdated
      ? [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "แก้รายการ",
              data: encodePostback("entry_edit", vm.entryId),
              displayText: "แก้รายการ",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "แก้วันที่",
              data: encodePostback("entry_date", vm.entryId),
              displayText: "แก้วันที่",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "ลบ",
              data: encodePostback("entry_del", vm.entryId),
              displayText: "ลบรายการ",
            },
          },
        ]
      : [
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "แก้",
              data: encodePostback("entry_edit", vm.entryId),
              displayText: "แก้รายการ",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 2,
            action: {
              type: "postback",
              label: "เปลี่ยนหมวด",
              data: encodePostback("entry_cat", vm.entryId),
              displayText: "เปลี่ยนหมวด",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 1,
            action: {
              type: "postback",
              label: "ลบ",
              data: encodePostback("entry_del", vm.entryId),
              displayText: "ลบรายการ",
            },
          },
        ];

  const quickActions: FlexAction[] = [];
  if (vm.pendingItem) {
    quickActions.push(
      {
        type: "postback",
        label: "ยืนยันจ่ายจริง",
        data: encodePostback("pay_real", vm.pendingItem.id),
        displayText: "ยืนยันจ่ายจริง",
      },
      {
        type: "postback",
        label: "ลองก่อนจ่าย",
        data: encodePostback("menu_try", vm.pendingItem.id),
        displayText: "ลองก่อนจ่าย",
      },
    );
  }
  quickActions.push(
    {
      type: "uri",
      label: isOver ? "ดูแผนใหม่" : "เปิดแผน",
      uri: miniAppUrl("/app/plan", vm.appOrigin),
    },
    {
      type: "postback",
      label: "วันนี้ใช้ได้",
      data: encodePostback("menu_today", "quick"),
      displayText: "วันนี้ใช้ได้เท่าไหร่",
    },
  );

  const firstItem = vm.items[0];
  const summaryTitle =
    vm.items.length === 1 && firstItem
      ? `${firstItem.title} ${bahtText(firstItem.amount)}`
      : `${vm.items.length} รายการ รวม ${bahtText(vm.totalAmount)}`;
  const statusAlt = isOver
    ? `เกินงบ ${bahtText(overAmount)}`
    : `วันนี้ใช้ได้อีก ${bahtText(vm.todayRemaining)}`;

  return {
    type: "flex",
    altText: `${heading} ${summaryTitle} · ${statusAlt}`,
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
                text: heading,
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: dateLabel,
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
      ...(!vm.hideEntryActions && {
        footer: {
          type: "box",
          layout: "horizontal",
          spacing: "xs",
          paddingAll: "12px",
          backgroundColor: FLEX_COLORS.white,
          contents: footerButtons,
        },
      }),
    },
    quickReply: {
      items: quickActions.map((action) => ({ type: "action", action })),
    },
  };
}
