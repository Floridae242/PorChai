import type { FlexMessage } from "@/lib/line/flex/types";

// LINE Messaging API reply. A reply costs no quota (a push does), so chat answers always use this.

export type QuickReplyAction =
  | { type: "uri"; label: string; uri: string }
  | { type: "postback"; label: string; data: string; displayText: string };

export interface TextMessage {
  type: "text";
  text: string;
  quickReply?: { items: { type: "action"; action: QuickReplyAction }[] };
}

export function text(body: string, actions: QuickReplyAction[] = []): TextMessage {
  return actions.length === 0
    ? { type: "text", text: body }
    : { type: "text", text: body, quickReply: { items: actions.map((action) => ({ type: "action", action })) } };
}

// Text, or a Flex card from lib/line/flex (โฟรวิว's cards)
export type ReplyMessage = TextMessage | FlexMessage;

export async function reply(replyToken: string, messages: ReplyMessage[]): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) throw new Error(`LINE reply ${res.status}: ${await res.text()}`);
}
