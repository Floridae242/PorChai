import { createHash } from "node:crypto";
import { pointsState } from "@/lib/db/rewards";
export interface PointsConnection {
  balance: number;
  accountCode: string;
  systemCode: string;
  release: string;
}
const code = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 12).toUpperCase();
/** Compare deployments/accounts without exposing LINE user IDs, URLs or credentials. */
export async function pointsConnection(
  userId: string,
  lineUserId: string,
): Promise<PointsConnection> {
  const wallet = await pointsState(userId);
  const host = new URL(process.env.SUPABASE_URL!).hostname;
  return {
    balance: wallet.balance,
    accountCode: code(lineUserId),
    systemCode: code(host),
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "sync-20261115",
  };
}
