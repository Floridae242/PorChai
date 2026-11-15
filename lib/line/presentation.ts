import { buildConversationCard } from "./flex/cards/conversation";
import type { ReplyMessage } from "./reply";

// One boundary for all outgoing chat. Specialized cards remain exactly as their builders produced them.
export function presentReply(message: ReplyMessage,heading?:string): ReplyMessage {
  return message.type === "text" ? buildConversationCard(message,heading) : message;
}
