import { appUrl } from "@/lib/liff/config";
import type { QuickReplyAction, TextMessage } from "./reply";

type FlexText = {
  type: "text";
  text: string;
  size?: string;
  color?: string;
  weight?: "bold";
  wrap?: boolean;
  flex?: number;
  align?: "end";
  margin?: string;
};
type FlexImage = {
  type: "image";
  url: string;
  size: string;
  aspectRatio: string;
  aspectMode: "fit";
};
type FlexButton = {
  type: "button";
  action: QuickReplyAction;
  style: "primary" | "secondary" | "link";
  color?: string;
  height: "sm";
  margin?: string;
};
export type FlexBox = {
  type: "box";
  layout: "vertical" | "horizontal";
  contents: FlexComponent[];
  backgroundColor?: string;
  paddingAll?: string;
  spacing?: string;
  margin?: string;
  cornerRadius?: string;
  flex?: number;
};
export type FlexComponent =
  | FlexText
  | FlexImage
  | FlexButton
  | FlexBox
  | { type: "separator"; margin?: string; color?: string };
export type FlexBubble = {
  type: "bubble";
  size: "mega";
  header?: FlexBox;
  body: FlexBox;
  footer?: FlexBox;
};
export interface FlexMessage {
  type: "flex";
  altText: string;
  contents: FlexBubble | { type: "carousel"; contents: FlexBubble[] };
  quickReply?: TextMessage["quickReply"];
}

const ink = "#173E2B";
const green = "#246B45";
const muted = "#627064";
const cream = "#F6F5E9";
const tx = (
  text: string,
  size = "sm",
  color = ink,
  bold = false,
): FlexText => ({
  type: "text",
  text,
  size,
  color,
  wrap: true,
  ...(bold ? { weight: "bold" } : {}),
});
const box = (
  contents: FlexComponent[],
  props: Partial<FlexBox> = {},
): FlexBox => ({ type: "box", layout: "vertical", contents, ...props });
const button = (label: string, path: string, primary = true): FlexButton => ({
  type: "button",
  height: "sm",
  style: primary ? "primary" : "secondary",
  ...(primary ? { color: green } : {}),
  action: { type: "uri", label, uri: appUrl(path) },
});

// Flex images must be public HTTPS PNG/JPEG. Animated WebP is used in LIFF instead.
function mascot(pose: string): FlexImage[] {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base =
    process.env.LINE_ASSET_BASE_URL ||
    (productionHost ? `https://${productionHost}` : undefined);
  if (!base) return [];
  try {
    const url = new URL(base);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return [];
    return [
      {
        type: "image",
        url: new URL(`/mascot/${pose}.png`, url.origin).href,
        size: "full",
        aspectRatio: "3:2",
        aspectMode: "fit",
      },
    ];
  } catch {
    return [];
  }
}

export function flexWelcome(fallback: TextMessage): FlexMessage {
  const cards = [
    {
      title: "พิมพ์จดได้เลย",
      subtitle: "ข้าว 50 · รถ 20",
      body: "ส่งชื่อรายการกับยอดทีละรายการ พอใช้ช่วยจัดหมวดให้",
      pose: "greeting",
      label: "เริ่มตั้งแผนเงิน",
      path: "/app/setup/income",
    },
    {
      title: "วันนี้เหลือใช้เท่าไร",
      subtitle: "เห็นแผน ก่อนเผลอใช้",
      body: "ดูเงินคงเหลือ บิล และงบรายวันจากรายการที่คุณจด",
      pose: "budgetOk",
      label: "ดูแผนของฉัน",
      path: "/app",
    },
    {
      title: "อยากซื้อ ลองคิดก่อน",
      subtitle: "พรุ่งนี้ชาบู 199 ไหวไหม",
      body: "ลองแผนก่อนจ่าย แล้วค่อยเลือกว่าจะเก็บไว้หรือจ่ายจริง",
      pose: "thinking",
      label: "ลองก่อนจ่าย",
      path: "/app/try",
    },
    {
      title: "จดง่าย ใช้ได้พอดี",
      subtitle: "เริ่มทีละนิดก็ได้",
      body: "ตั้งวันรับเงิน เงินที่มี และบิล เพื่อให้พอใช้ช่วยดูงบ",
      pose: "saveCoins",
      label: "เปิดพอใช้",
      path: "/app",
    },
  ];
  return {
    type: "flex",
    altText: fallback.text.slice(0, 400),
    quickReply: fallback.quickReply,
    contents: {
      type: "carousel",
      contents: cards.map((c): FlexBubble => ({
        type: "bubble",
        size: "mega",
        body: box(
          [
            tx("พอใช้ · เพื่อนช่วยคิดเรื่องเงิน", "xs", muted),
            tx(c.title, "xl", ink, true),
            tx(c.subtitle, "md", green, true),
            ...mascot(c.pose),
            tx(c.body, "sm", muted),
          ],
          { paddingAll: "20px", spacing: "md", backgroundColor: cream },
        ),
        footer: box([button(c.label, c.path)], {
          paddingAll: "16px",
          backgroundColor: cream,
        }),
      })),
    },
  };
}

export interface ReceiptCard {
  title: string;
  amount: string;
  category: string;
  date: string;
  budget: string;
  balance: string;
  entryId?: string;
}

export function flexReceipt(
  fallback: TextMessage,
  card: ReceiptCard,
): FlexMessage {
  return {
    type: "flex",
    altText: fallback.text.slice(0, 400),
    quickReply: fallback.quickReply,
    contents: {
      type: "bubble",
      size: "mega",
      header: box(
        [
          box(
            [
              tx("จดเรียบร้อย ✓", "xl", ink, true),
              tx("ตรวจรายการได้ แก้ไขเมื่อไรก็ได้", "xs", muted),
            ],
            { spacing: "sm", flex: 1 },
          ),
          ...mascot("budgetOk").map((image) => ({
            ...image,
            size: "60px",
            aspectRatio: "1:1",
          })),
        ],
        {
          layout: "horizontal",
          backgroundColor: cream,
          paddingAll: "20px",
          spacing: "sm",
        },
      ),
      body: box(
        [
          tx(`รายจ่าย · ${card.category}`, "xs", green, true),
          tx(card.date, "xs", muted),
          box(
            [
              tx(card.title, "lg", ink, true),
              { ...tx(`−฿${card.amount}`, "lg", green, true), align: "end" },
            ],
            { layout: "horizontal", spacing: "md" },
          ),
          { type: "separator", color: "#E3E8DB", margin: "lg" },
          tx(card.budget, "sm", ink),
          tx(`เงินคงเหลือ ฿${card.balance}`, "sm", muted),
        ],
        { paddingAll: "20px", spacing: "md" },
      ),
      footer: box(
        [
          ...(card.entryId
            ? [button("แก้ไข / ลบรายการ", `/app/record/${card.entryId}`, false)]
            : []),
          button("ดูแผนของฉัน", "/app"),
        ],
        { paddingAll: "16px", spacing: "sm" },
      ),
    },
  };
}

export function flexPrompt(
  fallback: TextMessage,
  title: string,
  label: string,
  path: string,
): FlexMessage {
  return {
    type: "flex",
    altText: fallback.text.slice(0, 400),
    quickReply: fallback.quickReply,
    contents: {
      type: "bubble",
      size: "mega",
      body: box(
        [
          tx(title, "xl", ink, true),
          ...mascot("greeting"),
          tx(fallback.text, "sm", muted),
        ],
        { paddingAll: "20px", spacing: "md", backgroundColor: cream },
      ),
      footer: box([button(label, path)], { paddingAll: "16px" }),
    },
  };
}

export function flexActions(
  fallback: TextMessage,
  title: string,
  pose = "thinking",
): FlexMessage {
  const actions = fallback.quickReply?.items.map((item) => item.action) ?? [];
  return {
    type: "flex",
    altText: fallback.text.slice(0, 400),
    quickReply: fallback.quickReply,
    contents: {
      type: "bubble",
      size: "mega",
      body: box(
        [
          tx(title, "xl", ink, true),
          ...mascot(pose),
          tx(fallback.text, "sm", muted),
        ],
        { paddingAll: "20px", spacing: "md", backgroundColor: cream },
      ),
      ...(actions.length
        ? {
            footer: box(
              actions.map((action, index): FlexButton => ({
                type: "button",
                action,
                height: "sm",
                style: index === 0 ? "primary" : "secondary",
                ...(index === 0 ? { color: green } : {}),
              })),
              { paddingAll: "16px", spacing: "sm" },
            ),
          }
        : {}),
    },
  };
}
