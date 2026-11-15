import { getDb } from "@/lib/db/client";

// One row per LINE account, whichever way it arrives: LIFF (ID token) or a chat (webhook).
// Both LINE channels sit under one provider, so they see the same LINE user id (card 06).
// Upsert is race-safe: concurrent first requests end with one row.
export async function userIdForLine(lineUserId: string): Promise<string> {
  const db = getDb();
  // Existing accounts are reads, not an upsert/write lock on every authenticated API request.
  const existing = await db.from("users").select("id").eq("line_user_id", lineUserId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id as string;
  const { data, error } = await db
    .from("users")
    .upsert({ line_user_id: lineUserId }, { onConflict: "line_user_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
