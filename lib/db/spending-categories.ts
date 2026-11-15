import { getDb } from "./client";
import { parseCategory } from "@/lib/insights/categories";
import type { SpendingCategory } from "@/lib/insights/types";
import { HttpError } from "@/lib/http";
interface Row {
  id: string;
  label: string;
  parent: SpendingCategory["parent"];
  monthly_budget: number | null;
  updated_at: string;
}
const map = (r: Row): SpendingCategory => ({
  id: r.id,
  label: r.label,
  parent: r.parent,
  monthlyBudget: r.monthly_budget,
  version: r.updated_at,
});
export async function spendingCategories(
  userId: string,
): Promise<SpendingCategory[]> {
  const { data, error } = await getDb()
    .from("spending_categories")
    .select("id,label,parent,monthly_budget,updated_at")
    .eq("user_id", userId)
    .order("parent")
    .order("id")
    .limit(100);
  if (error) throw error;
  return (data as Row[]).map(map);
}
export async function saveSpendingCategory(
  userId: string,
  input: unknown,
): Promise<SpendingCategory> {
  const p = parseCategory(input);
  const { data, error } = await getDb().rpc("save_spending_category", {
    p_user: userId,
    p_id: p.id ?? null,
    p_label: p.label,
    p_parent: p.parent,
    p_budget: p.monthlyBudget,
    p_version: p.version ?? null,
  });
  if (error?.code.startsWith("SC"))
    throw new HttpError(
      Number(error.code.slice(2)),
      error.code === "SC409" ? "stale" : "invalid_category",
      error.code === "SC409"
        ? "หมวดถูกแก้จากอีกหน้าจอแล้ว โหลดใหม่ก่อนยืนยันครับ"
        : "ชื่อหมวดซ้ำ กลุ่มไม่ถูกต้อง หรือไม่พบหมวดของบัญชีนี้ครับ",
    );
  if (error) throw error;
  return map(data as Row);
}
