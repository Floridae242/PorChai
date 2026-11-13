import { bahtText, FLEX_COLORS, mascotPngUrl, miniAppUrl } from "../format";
import { encodePostback } from "../postback";
import type {
  FlexMessage,
  HabitEditAskViewModel,
  HabitReminderCardViewModel,
  HabitSkippedViewModel,
  TextReplyMessage,
} from "../types";

/**
 * C-16: Habit Reminder Card (12:30 lunch reminder).
 * Blends our soft green header with Figma C-16's exact copy and subnote.
 * 3 buttons: [ใช่ จดเลย] [แก้ยอด] [วันนี้ไม่ได้ซื้อ]
 * Quick reply: [ตั้งค่าการเตือน]
 */
export function buildHabitReminderCard(vm: HabitReminderCardViewModel): FlexMessage {
  const amountStr = bahtText(vm.habitAmount);
  const timeLabel = vm.timeLabel ?? "12:30";
  const bodyCopy = `วันนี้ยังไม่เห็นรายการ${vm.habitTitle}ครับ ปกติคุณจดไว้ประมาณ ${amountStr} วันนี้จ่าย ${amountStr}เหมือนเดิมไหม?`;

  return {
    type: "flex",
    altText: `เตือนรายการประจำ (${vm.habitTitle}): ปกติประมาณ ${amountStr} วันนี้จ่ายเหมือนเดิมไหมครับ`,
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
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              {
                type: "text",
                text: "เตือนรายการประจำ",
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green900,
              },
              {
                type: "text",
                text: `${vm.habitTitle} · เวลา ${timeLabel}`,
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
            type: "text",
            text: bodyCopy,
            size: "sm",
            color: FLEX_COLORS.green900,
            wrap: true,
          },
          {
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: FLEX_COLORS.lime50,
            cornerRadius: "10px",
            paddingAll: "12px",
            margin: "md",
            contents: [
              {
                type: "text",
                text: vm.habitTitle,
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green900,
                flex: 1,
                wrap: true,
              },
              {
                type: "text",
                text: amountStr,
                size: "md",
                weight: "bold",
                color: FLEX_COLORS.green700,
                align: "end",
                flex: 0,
              },
            ],
          },
          {
            type: "text",
            text: "ดูจากรายการที่ยืนยันแล้ว 3 วันขึ้นไป · เปลี่ยนเวลาหรือปิดได้ในแอป › ตั้งค่า › การเตือน",
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
        contents: [
          {
            type: "button",
            style: "primary",
            color: FLEX_COLORS.green800,
            height: "sm",
            action: {
              type: "postback",
              label: "ใช่ จดเลย",
              data: encodePostback("rem_yes", vm.reminderId),
              displayText: "ใช่ จดเลย",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "แก้ยอด",
              data: encodePostback("rem_edit", vm.reminderId),
              displayText: "แก้ยอด",
            },
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            action: {
              type: "postback",
              label: "วันนี้ไม่ได้ซื้อ",
              data: encodePostback("rem_skip", vm.reminderId),
              displayText: "วันนี้ไม่ได้ซื้อ",
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
            type: "uri",
            label: "ตั้งค่าการเตือน",
            uri: miniAppUrl("/app/settings/reminders", vm.appOrigin),
          },
        },
      ],
    },
  };
}

/**
 * C-16c: Response after tapping [แก้ยอด] on C-16.
 * Prompts user to type the new amount or tap a quick reply preset.
 */
export function buildHabitEditAskMessage(vm: HabitEditAskViewModel): TextReplyMessage {
  return {
    type: "text",
    text: `วันนี้${vm.habitTitle}จ่ายเท่าไหร่ครับ พิมพ์ตัวเลขบอกได้เลย (เช่น 60)`,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "ยกเลิกการแก้",
            data: encodePostback("rem_edit_cancel", vm.reminderId),
            displayText: "ยกเลิกการแก้",
          },
        },
      ],
    },
  };
}

/**
 * C-16b (skip branch): Response after tapping [วันนี้ไม่ได้ซื้อ] on C-16.
 */
export function buildHabitSkippedMessage(vm: HabitSkippedViewModel): TextReplyMessage {
  return {
    type: "text",
    text: `รับทราบครับ วันนี้ไม่จด${vm.habitTitle} และไม่เตือนซ้ำวันนี้ · วันนี้ยังใช้ได้อีก ${bahtText(vm.todayRemaining)}`,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "uri",
            label: "ตั้งค่าการเตือน",
            uri: miniAppUrl("/app/settings/reminders", vm.appOrigin),
          },
        },
      ],
    },
  };
}
