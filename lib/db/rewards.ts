import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http";
import { thaiDate } from "@/lib/calc/time";
import type { PointsHistory, PointsHistoryItem, Reward } from "@/lib/client/types";

export interface PointsState { balance: number; claimedToday: boolean }
export interface DailyClaim { balance: number; claimedToday: true; created: boolean }
export interface RewardClaim { balance: number; code: string; created: boolean }

function checkError(error: { code: string; message: string } | null): void {
  if (!error) return;
  const messages: Record<string, string> = {
    not_found: "ไม่พบของรางวัลนี้",
    out_of_stock: "ของรางวัลหมดแล้ว",
    not_enough_points: "แต้มยังไม่พอสำหรับของรางวัลนี้",
    idempotency_conflict: "คำขอนี้ใช้ไปแล้ว กรุณาเริ่มรายการใหม่",
    invalid_key: "คำขอไม่ถูกต้อง ลองใหม่อีกครั้ง",
  };
  if (["RW400", "RW404", "RW409"].includes(error.code) && messages[error.message]) {
    throw new HttpError(Number(error.code.slice(2)), error.message, messages[error.message]);
  }
  throw error;
}

export async function pointsState(userId: string): Promise<PointsState> {
  const { data, error } = await getDb().rpc("points_state", { p_user: userId });
  checkError(error);
  return data;
}
export async function claimDailyPoints(userId: string, key: string): Promise<DailyClaim> {
  const { data, error } = await getDb().rpc("claim_daily_points", { p_user: userId, p_key: key });
  checkError(error);
  return data;
}
export async function listRewards(): Promise<Reward[]> {
  // The MINI App displays the latest 100 active offers, as documented in frontend-api.md.
  // Bounded reads keep campaign catalog growth from extending every page request indefinitely.
  const { data, error } = await getDb().from("rewards").select("id,name,cost,stock")
    .eq("active", true).order("created_at", { ascending: false }).order("id").limit(100);
  checkError(error);
  return data ?? [];
}
export async function redeemReward(userId: string, rewardId: string, key: string): Promise<RewardClaim> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rewardId)) {
    throw new HttpError(404, "not_found", "ไม่พบของรางวัลนี้");
  }
  const { data, error } = await getDb().rpc("redeem_reward", { p_user: userId, p_reward: rewardId, p_key: key });
  checkError(error);
  return data;
}

// Points history: the latest ledger rows of this user, newest first. Read-only. A redemption shows the
// reward's name but never its code. The query runs with the service role, so the user id filter is the
// only thing that keeps it to one account.
export const HISTORY_LIMIT = 50;

export interface LedgerRow {
  id: string;
  kind: string;
  delta: number;
  earned_on: string | null;
  created_at: string;
  // PostgREST gives a to-one embed as an object; an array is accepted as well.
  reward_claims?: { rewards?: { name?: unknown } | { name?: unknown }[] | null } | { rewards?: { name?: unknown } | { name?: unknown }[] | null }[] | null;
}

const first = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export function toHistoryItem(row: LedgerRow): PointsHistoryItem | null {
  if (row.kind !== "daily" && row.kind !== "redemption") return null;
  const name = first(first(row.reward_claims)?.rewards)?.name;
  return {
    id: row.id,
    kind: row.kind,
    delta: row.delta,
    day: row.kind === "daily" && row.earned_on ? row.earned_on : thaiDate(new Date(row.created_at)),
    rewardName: row.kind === "redemption" && typeof name === "string" ? name : null,
  };
}

export async function pointsHistory(userId: string): Promise<PointsHistory> {
  const { data, error } = await getDb()
    .from("points_ledger")
    .select("id,kind,delta,earned_on,created_at,reward_claims(rewards(name))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT);
  checkError(error);
  return { items: ((data ?? []) as unknown as LedgerRow[]).map(toHistoryItem).filter((i): i is PointsHistoryItem => i !== null) };
}
