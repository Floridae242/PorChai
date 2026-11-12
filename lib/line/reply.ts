import type { FlexMessage } from "./flex";

// LINE Messaging API reply. Chat replies use the reply token, never a push.

export type QuickReplyAction =
  | { type: "uri"; label: string; uri: string }
  | { type: "postback"; label: string; data: string; displayText: string };

export interface TextMessage {
  type: "text";
  text: string;
  quickReply?: { items: { type: "action"; action: QuickReplyAction }[] };
}

export type LineMessage = TextMessage | FlexMessage;

export function text(
  body: string,
  actions: QuickReplyAction[] = [],
): TextMessage {
  return actions.length === 0
    ? { type: "text", text: body }
    : {
        type: "text",
        text: body,
        quickReply: {
          items: actions.map((action) => ({ type: "action", action })),
        },
      };
}

export async function reply(
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`LINE reply failed (${res.status})`);
}
