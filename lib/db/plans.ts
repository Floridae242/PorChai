import type { Plan, UserCategory } from "@/lib/api-types";
import { heldThisCycle } from "@/lib/calc/inputs";
import { getDb } from "@/lib/db/client";
import { loadBudget, requireActiveCycle, requireBasis, type ActiveCycle } from "@/lib/db/budget";
import { HttpError } from "@/lib/http";
import type { PlanRequest } from "@/lib/validate";

const COLUMNS = "id, kind, title, amount, due_on, category, status, entry_id, created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PLAN_ACTIONS = ["pay", "unpay", "cancel", "postpone", "keep"] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];

interface Row {
  id: string;
  kind: Plan["kind"];
  title: string;
  amount: number;
  due_on: string | null;
  category: UserCategory | null;
  status: Plan["status"];
  entry_id: string | null;
  created_at: string;
}

const toPlan = (r: Row, payday: string): Plan => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  amount: r.amount,
  dueOn: r.due_on,
  category: r.category,
  status: r.status,
  entryId: r.entry_id,
  heldThisCycle: heldThisCycle({ status: r.status, dueOn: r.due_on }, payday),
  createdAt: r.created_at,
});

const NOT_FOUND = () => new HttpError(404, "not_found", "ไม่พบแผนนี้");

// Why an action was refused, by the plan's current status
const BLOCKED: Record<Plan["status"], string> = {
  paid: "แผนนี้จ่ายแล้ว ถ้ากดผิดให้ยกเลิกการจ่ายก่อน",
  cancelled: "แผนนี้ถูกยกเลิกแล้ว",
  separate: "บิลนี้จ่ายแยกแล้ว ไม่ได้กันเงินในแอป",
  reserved: "แผนนี้ยังไม่ได้จ่าย",
  postponed: "แผนนี้ยังไม่ได้จ่าย",
};

// Plans of the caller's active cycle, oldest first (W16 "แผนของฉัน")
export async function listPlans(userId: string): Promise<Plan[]> {
  const cycle = await requireActiveCycle(userId);
  const { data, error } = await getDb()
    .from("plans")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("cycle_id", cycle.id)
    .order("created_at");
  if (error) throw error;
  return (data as Row[]).map((r) => toPlan(r, cycle.payday));
}

// Same key for the same user = the same tap: a retry or double tap returns the first plan.
export async function addPlan(
  userId: string,
  input: PlanRequest,
  idempotencyKey: string,
): Promise<{ plan: Plan; created: boolean }> {
  const db = getDb();
  const cycle = await requireActiveCycle(userId);
  if (input.basis) {
    // A double tap first: the same key is the same plan, even though the numbers have moved since
    const seen = await db.from("plans").select(COLUMNS).eq("user_id", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (seen.error) throw seen.error;
    if (seen.data) return { plan: toPlan(seen.data as Row, cycle.payday), created: false };
    requireBasis(await loadBudget(userId), input.basis); // card 23: decided on numbers that changed → recalculate
  }
  const { data, error } = await db
    .from("plans")
    .insert({
      user_id: userId,
      cycle_id: cycle.id,
      kind: input.kind,
      title: input.title,
      amount: input.amount,
      due_on: input.dueOn,
      category: input.category,
      status: input.status,
      idempotency_key: idempotencyKey,
    })
    .select(COLUMNS)
    .single();
  if (!error) return { plan: toPlan(data as Row, cycle.payday), created: true };
  if (error.code !== "23505") throw error;

  const existing = await db
    .from("plans")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .single();
  if (existing.error) throw existing.error;
  return { plan: toPlan(existing.data as Row, cycle.payday), created: false };
}

// One locked transaction in the database (plan_action). Only the owner's plan in the active cycle
// is found; anyone else gets 404. Asking twice for the same state is not an error.
export async function actOnPlan(
  userId: string,
  id: string,
  action: PlanAction,
  category: UserCategory | null,
  today: string,
): Promise<Plan> {
  if (!UUID.test(id)) throw NOT_FOUND();
  const cycle = await requireActiveCycle(userId);
  const { error } = await getDb().rpc("plan_action", {
    p_user: userId,
    p_cycle: cycle.id,
    p_plan: id,
    p_action: action,
    p_category: category,
    p_today: today,
  });
  if (error?.code === "PR404") throw NOT_FOUND();
  if (error?.code === "PR409") {
    const status = error.message as Plan["status"];
    throw new HttpError(409, "plan_status", BLOCKED[status] ?? "ทำกับแผนนี้ไม่ได้");
  }
  if (error) throw error;
  return ownPlan(cycle, id);
}

async function ownPlan(cycle: ActiveCycle, id: string): Promise<Plan> {
  const { data, error } = await getDb().from("plans").select(COLUMNS).eq("id", id).eq("cycle_id", cycle.id).single();
  if (error) throw error;
  return toPlan(data as Row, cycle.payday);
}

// A plan kept from the chat, found by the key of the message it came from
export async function planIdByKey(userId: string, idempotencyKey: string): Promise<string | null> {
  const { data, error } = await getDb()
    .from("plans")
    .select("id")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}
