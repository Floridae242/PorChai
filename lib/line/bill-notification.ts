import type { FlexMessage } from "./branded-flex";
import { appUrl } from "@/lib/liff/config";
import { formatBaht } from "@/lib/format/money";
export function billNotification(
  bill: {
    title: string;
    amount: number;
    dueOn: string;
    repeat: "once" | "monthly";
  },
  lead: 0 | 3,
): FlexMessage {
  const heading = lead === 3 ? "อีก 3 วันถึงวันจ่ายบิล" : "บิลครบกำหนดวันนี้";
  const date = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${bill.dueOn}T00:00:00Z`));
  return {
    type: "flex",
    altText: `${heading} · ${bill.title} ${formatBaht(bill.amount)} บาท`.slice(
      0,
      400,
    ),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#EAF3CE",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "พอใช้ · เตือนบิล",
            size: "sm",
            color: "#246B45",
            weight: "bold",
          },
          {
            type: "text",
            text: heading,
            size: "lg",
            weight: "bold",
            color: "#173E2B",
            wrap: true,
            margin: "md",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: bill.title,
            size: "lg",
            weight: "bold",
            wrap: true,
            color: "#173E2B",
          },
          {
            type: "text",
            text: `${formatBaht(bill.amount)} บาท`,
            size: "xl",
            weight: "bold",
            color: "#246B45",
          },
          {
            type: "text",
            text: `ครบกำหนด ${date}`,
            size: "sm",
            wrap: true,
            color: "#627064",
          },
          {
            type: "text",
            text: bill.repeat === "monthly" ? "บิลรายเดือน" : "บิลครั้งเดียว",
            size: "sm",
            color: "#627064",
          },
          {
            type: "text",
            text: "ถ้าจ่ายแล้ว เปิดรายการบิลเพื่อตรวจและยืนยันจ่ายจริงได้ครับ การแจ้งเตือนนี้ยังไม่บันทึกรายจ่าย",
            size: "sm",
            wrap: true,
            color: "#627064",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        spacing: "sm",
        contents: [
          {
            type: "button",
            height: "sm",
            style: "primary",
            color: "#246B45",
            action: {
              type: "uri",
              label: "ดูบิล / จ่ายแล้ว",
              uri: appUrl("/app/plan"),
            },
          },
          {
            type: "button",
            height: "sm",
            style: "secondary",
            action: {
              type: "uri",
              label: "จัดการเตือนบิล",
              uri: appUrl("/app/settings/bills"),
            },
          },
        ],
      },
    },
  };
}
