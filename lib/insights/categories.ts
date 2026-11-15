import type { SaveCategory } from "./types";
import { HttpError } from "@/lib/http";
import { USER_CATEGORIES } from "@/lib/api-types";
export const CATEGORY_IDS = [...USER_CATEGORIES, "bills"];
export const categoryIdOk = (v: unknown): v is string =>
  typeof v === "string" &&
  (CATEGORY_IDS.includes(v) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
export function parseCategory(value: unknown): SaveCategory {
  const v = value as Partial<SaveCategory> | null;
  if (
    !v ||
    typeof v.label !== "string" ||
    !v.label.trim() ||
    v.label.trim().length > 30 ||
    !CATEGORY_IDS.includes(String(v.parent)) ||
    (v.id !== undefined && !categoryIdOk(v.id)) ||
    (v.monthlyBudget !== null &&
      (!Number.isSafeInteger(v.monthlyBudget) ||
        v.monthlyBudget! < 0 ||
        v.monthlyBudget! > 10000000)) ||
    (v.id !== undefined &&
      (typeof v.version !== "string" ||
        !Number.isFinite(Date.parse(v.version)))) ||
    (v.id === undefined && v.parent === "bills")
  )
    throw new HttpError(
      422,
      "invalid_category",
      "ระบุชื่อหมวด กลุ่ม และงบรายเดือนให้ถูกต้องครับ งบเว้นว่างได้ หรือ 0–100,000 บาท",
    );
  return {
    label: v.label.trim(),
    parent: v.parent!,
    monthlyBudget: v.monthlyBudget!,
    ...(v.id ? { id: v.id, version: v.version } : {}),
  };
}
