import type { Entry } from "@/lib/api-types";
import { getDb } from "@/lib/db/client";
import { requireActiveCycle } from "@/lib/db/budget";
import { HttpError } from "@/lib/http";
import type { EntryPatch, NewEntry } from "@/lib/validate";

const COLUMNS = "id, amount, category, note, spent_on, source, created_at, cancelled_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  amount: number;
  category: Entry["category"];
  note: string | null;
  spent_on: string;
  source: Entry["source"];
  created_at: string;
  cancelled_at: string | null;
}

const toEntry = (r: Row): Entry => ({
  id: r.id,
  amount: r.amount,
  category: r.category,
  note: r.note,
  spentOn: r.spent_on,
  source: r.source,
  createdAt: r.created_at,
});

const NOT_FOUND = () => new HttpError(404, "not_found", "ไม่พบรายการนี้");

export async function listEntries(userId: string): Promise<Entry[]> {
  const cycle = await requireActiveCycle(userId);
  const { data, error } = await getDb()
    .from("entries")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("cycle_id", cycle.id)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(toEntry);
}

// Same key for the same user = the same spend: a retry or double tap returns the first entry.
export async function addEntry(
  userId: string,
  input: NewEntry,
  idempotencyKey: string,
  source: Entry["source"],
): Promise<{ entry: Entry; created: boolean }> {
  const db = getDb();
  const cycle = await requireActiveCycle(userId);
  const { data, error } = await db
    .from("entries")
    .insert({
      user_id: userId,
      cycle_id: cycle.id,
      amount: input.amount,
      category: input.category,
      note: input.note,
      spent_on: input.spentOn,
      source,
      idempotency_key: idempotencyKey,
    })
    .select(COLUMNS)
    .single();
  if (!error) return { entry: toEntry(data as Row), created: true };
  if (error.code !== "23505") throw error;

  const existing = await db
    .from("entries")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .single();
  if (existing.error) throw existing.error;
  return { entry: toEntry(existing.data as Row), created: false };
}

// Only the owner's entry is found; anyone else gets 404, so they cannot learn it exists.
async function ownEntry(userId: string, id: string): Promise<Row> {
  if (!UUID.test(id)) throw NOT_FOUND();
  const { data, error } = await getDb().from("entries").select(COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw NOT_FOUND();
  return data as Row;
}

const CANCELLED = () => new HttpError(409, "entry_cancelled", "รายการนี้ถูกยกเลิกแล้ว");

// Paying a plan made this entry: its amount and date are the plan's, and undoing it belongs to the
// plan (unpay), or the plan would stay "paid". Only a purchase's category may change (L9).
function checkPlanEntryEdit(row: Row, patch: EntryPatch): void {
  if (row.source !== "plan") return;
  if (row.category === "bills") throw new HttpError(409, "plan_entry", "รายการจ่ายบิลเปลี่ยนหมวดไม่ได้");
  if (Object.keys(patch).some((k) => k !== "category")) {
    throw new HttpError(409, "plan_entry", "รายการนี้มาจากการจ่ายแผน เปลี่ยนได้แค่หมวด");
  }
}

export async function editEntry(userId: string, id: string, patch: EntryPatch): Promise<Entry> {
  const row = await ownEntry(userId, id);
  checkPlanEntryEdit(row, patch);
  if (row.cancelled_at) throw CANCELLED();
  const { data, error } = await getDb()
    .from("entries")
    .update({
      ...(patch.amount !== undefined && { amount: patch.amount }),
      ...(patch.category !== undefined && { category: patch.category }),
      ...(patch.note !== undefined && { note: patch.note }),
      ...(patch.spentOn !== undefined && { spent_on: patch.spentOn }),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select(COLUMNS)
    .single();
  // The DB refuses edits to a cancelled entry; a cancel may have landed since we read it
  if (error?.code === "23514") throw CANCELLED();
  if (error) throw error;
  return toEntry(data as Row);
}

// Cancel, never delete: the row and its history stay. Cancelling twice returns the same entry.
export async function cancelEntry(userId: string, id: string): Promise<Entry> {
  const row = await ownEntry(userId, id);
  if (row.source === "plan") throw new HttpError(409, "plan_entry", "รายการนี้มาจากการจ่ายแผน ให้ยกเลิกการจ่ายที่แผนแทน");
  if (row.cancelled_at) return toEntry(row);
  const { error } = await getDb()
    .from("entries")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("cancelled_at", null);
  // 23514: a concurrent cancel won; the entry is cancelled either way
  if (error && error.code !== "23514") throw error;
  return toEntry(row);
}

export async function entryExists(userId: string, idempotencyKey: string): Promise<boolean> {
  const { count, error } = await getDb()
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey);
  if (error) throw error;
  return (count ?? 0) > 0;
}
