import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http";
import type { Reward } from "@/lib/client/types";

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
