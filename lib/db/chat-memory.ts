import type { UserCategory } from "@/lib/api-types";
import { getDb } from "@/lib/db/client";
import type { SlipKind } from "@/lib/ocr/slip";

// Short chat memory (migration 20261113000000_chat_memory). The database forgets lines older than
// 30 minutes and beyond the newest 10; reads also skip anything older, in case nobody wrote since.

const WINDOW_MS = 30 * 60_000;
const LIMIT = 10;

export interface ProposedItem {
  title: string;
  amount: number; // satang
  category: UserCategory;
}

// What the bot's answer waits for
export type Pending =
  | { kind: "amount"; title: string } // «ข้าว» → asked how much
  | { kind: "title"; amount: number } // «45» → asked what for
  | { kind: "items"; key: string; items: ProposedItem[] } // several spends → [จดทั้งหมด][ไม่ใช่]
  | { kind: "edit"; entryId: string; title: string } // card [แก้] → «50»
  | { kind: "reminder"; reminderId: string } // card 58 [แก้ยอด] → «60»
  // a slip's draft card; awaiting = after [แก้ยอด]; closed = cancelled / own transfer (its buttons do nothing)
  | { kind: "ocr"; draft: OcrDraft; awaiting?: "amount"; closed?: true };

// OCR (layer 4): what the AI read from a slip, until the user saves or cancels it. The photo is not kept.
export interface OcrDraft {
  id: string;
  kind: SlipKind;
  merchant: string;
  amount: number; // satang
  candidates: number[];
  date: string;
}

export interface ChatLine {
  role: "user" | "bot";
  body: string;
  pending: Pending | null;
}

const since = () => new Date(Date.now() - WINDOW_MS).toISOString();

// Oldest first, as the conversation went
export async function recentChat(userId: string): Promise<ChatLine[]> {
  const { data, error } = await getDb()
    .from("chat_messages")
    .select("role, body, pending")
    .eq("user_id", userId)
    .gte("created_at", since())
    .order("id", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return (data as ChatLine[]).reverse();
}

export async function remember(userId: string, lines: { role: ChatLine["role"]; body: string; pending?: Pending | null }[]) {
  const rows = lines.map((l) => ({ user_id: userId, role: l.role, body: l.body.slice(0, 2000), pending: l.pending ?? null }));
  const { error } = await getDb().from("chat_messages").insert(rows);
  if (error) throw error;
}

// The latest version of a slip's draft (each change is a new bot line), while still remembered
export async function ocrDraftFor(userId: string, id: string): Promise<{ draft: OcrDraft; closed: boolean } | null> {
  const { data, error } = await getDb()
    .from("chat_messages")
    .select("pending, body")
    .eq("user_id", userId)
    .eq("role", "bot")
    .eq("pending->>kind", "ocr")
    .eq("pending->draft->>id", id)
    .gte("created_at", since())
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw error;
  const p = data[0]?.pending as Extract<Pending, { kind: "ocr" }> | undefined;
  return p ? { draft: p.draft, closed: p.closed === true } : null;
}

// The items a [จดทั้งหมด] button points at, while the proposal is still remembered
export async function proposalFor(userId: string, key: string): Promise<ProposedItem[] | null> {
  const { data, error } = await getDb()
    .from("chat_messages")
    .select("pending")
    .eq("user_id", userId)
    .eq("role", "bot")
    .eq("pending->>kind", "items")
    .eq("pending->>key", key)
    .gte("created_at", since())
    .limit(1);
  if (error) throw error;
  const pending = data[0]?.pending as Extract<Pending, { kind: "items" }> | undefined;
  return pending?.items ?? null;
}
