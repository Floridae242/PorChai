import { withAppButton, type ReplyMessage } from "@/lib/line/reply";
import { presentReply } from "./presentation";

// LINE Messaging API push (card 58 reminders). Unlike a reply it uses the OA's monthly quota, so only
// the scheduler sends one, at most one reminder per habit per day. The retry key makes LINE send a
// retried request once (docs: "X-Line-Retry-Key", a UUID).
export async function push(to: string, messages: ReplyMessage[], retryKey: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Line-Retry-Key": retryKey },
    body: JSON.stringify({ to, messages: messages.map((m) => presentReply(withAppButton(m))) }),
  });
  // 409: this retry key was already accepted — the reminder went out
  if (!res.ok && res.status !== 409) throw new Error(`LINE push ${res.status}: ${await res.text()}`);
}
