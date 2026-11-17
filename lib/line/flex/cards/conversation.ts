import { FLEX_COLORS, iconPngUrl, type PorchaiIcon } from "../format";
import type { FlexMessage, FlexText, LineChatMessage, TextReplyMessage } from "../types";

const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });

function contextIcon(heading?: string): PorchaiIcon {
  if (/ยืนยัน|ตรวจข้อมูล/u.test(heading ?? "")) return "receipt";
  if (/อีกครั้ง|ผิดพลาด/u.test(heading ?? "")) return "warning";
  if (/ผลการทำรายการ/u.test(heading ?? "")) return "check";
  if (/เตือน/u.test(heading ?? "")) return "bell";
  if (/แผน|บิล/u.test(heading ?? "")) return "budget-calendar";
  if (/แต้ม|รางวัล/u.test(heading ?? "")) return "gift-box";
  return "chat";
}

/** Readable conversation bubble; keyboard shortcuts stay out of the content footer. */
export function buildConversationCard(message: TextReplyMessage,heading?:string): LineChatMessage {
  const body = message.text;
  // Exceptional replies remain plain text; never silently remove part of the user's answer.
  if (!body.trim() || body.length > 4000) return message;
  const chunks: string[] = [];
  let chunk = "";
  let altText = "";
  let altFull = false;
  for (const { segment } of segmenter.segment(body)) {
    if (segment.length > 1000) return message;
    if (chunk.length + segment.length > 1000) { chunks.push(chunk); chunk = ""; }
    chunk += segment;
    if (!altFull) {
      if (altText.length + segment.length > 399) { altText += "…"; altFull = true; }
      else altText += segment;
    }
  }
  if (chunk) chunks.push(chunk);
  // Short text has no need for an ellipsis (including an exactly 400-unit string).
  if (body.length <= 400) altText = body;
  const actions = message.quickReply?.items.map((item) => item.action)
    .filter((action) => action.label !== "เปิดแอป" && !(action.type === "postback" && action.data === "guide:all"))
    .slice(0, 3) ?? [];
  const confirming = actions.some((action) => action.type === "postback" && action.data.startsWith("pc:yes:"));
  const card: FlexMessage = {
    type: "flex",
    altText,
    ...(message.quickReply ? { quickReply: message.quickReply } : {}),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "horizontal", paddingAll: "14px", paddingBottom: "0px", spacing: "sm", alignItems: "center",
        contents: [
          { type: "image", url: iconPngUrl(contextIcon(heading)), size: "xxs", aspectMode: "fit", flex: 0 },
          { type: "text", text: heading?.trim() && heading.length<=60 ? `น้องพอใช้ · ${heading}` : "น้องพอใช้", size: "sm", weight: "bold", color: FLEX_COLORS.green800, wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm", backgroundColor: FLEX_COLORS.white,
        contents: chunks.map((text): FlexText => ({ type: "text", text, size: "md", color: FLEX_COLORS.green900, wrap: true })),
      },
      ...(actions.length ? { footer: {
        type: "box" as const, layout: confirming ? "horizontal" as const : "vertical" as const, paddingAll: "12px", paddingTop: "0px", spacing: "sm" as const,
        backgroundColor: FLEX_COLORS.white,
        contents: actions.map((action) => ({
          type: "button" as const, action, height: "sm" as const,
          style: confirming && action.type === "postback" && action.data.startsWith("pc:yes:") ? "primary" as const : "link" as const,
          color: FLEX_COLORS.green800,
        })),
      } } : {}),
    },
  };
  return new TextEncoder().encode(JSON.stringify(card.contents)).byteLength < 28 * 1024 ? card : message;
}
