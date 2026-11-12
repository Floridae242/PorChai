import { getDb } from "@/lib/db/client";

// One row per LINE account, whichever way it arrives: LIFF (ID token) or a chat (webhook).
// Both LINE channels sit under one provider, so they see the same LINE user id (card 06).
// Upsert is race-safe: concurrent first requests end with one row.
export async function userIdForLine(lineUserId: string): Promise<string> {
  const { data, error } = await getDb()
    .from("users")
    .upsert({ line_user_id: lineUserId }, { onConflict: "line_user_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
