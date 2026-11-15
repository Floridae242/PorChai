import { FLEX_COLORS } from "../format";
import type { FlexMessage, FlexText, LineChatMessage, TextReplyMessage } from "../types";

const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });

/** Compact, image-independent card for AI wording, questions and status replies. No financial logic. */
export function buildConversationCard(message: TextReplyMessage): LineChatMessage {
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
  const actions = message.quickReply?.items.slice(0, 3).map((item) => item.action) ?? [];
  const card: FlexMessage = {
    type: "flex",
    altText,
    ...(message.quickReply ? { quickReply: message.quickReply } : {}),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", paddingAll: "16px", backgroundColor: FLEX_COLORS.lime100,
        contents: [{ type: "text", text: "พอใช้ · PORCHAI", size: "sm", weight: "bold", color: FLEX_COLORS.green900, wrap: true }],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "20px", backgroundColor: FLEX_COLORS.white,
        contents: chunks.map((text): FlexText => ({ type: "text", text, size: "md", color: FLEX_COLORS.green900, wrap: true })),
      },
      ...(actions.length ? { footer: {
        type: "box" as const, layout: "vertical" as const, paddingAll: "16px", spacing: "sm" as const,
        backgroundColor: FLEX_COLORS.white,
        contents: actions.map((action) => ({
          type: "button" as const, action, height: "md" as const,
          style: action.type === "uri" && action.label === "เปิดแอป" ? "primary" as const : "secondary" as const,
          ...(action.type === "uri" && action.label === "เปิดแอป" ? { color: FLEX_COLORS.green800 } : {}),
        })),
      } } : {}),
    },
  };
  return new TextEncoder().encode(JSON.stringify(card.contents)).byteLength < 28 * 1024 ? card : message;
}
