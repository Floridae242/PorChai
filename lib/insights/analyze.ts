import type { SpendingInsights } from "./types";
import { formatBaht } from "@/lib/format/money";
// All facts and suggested amounts are deterministic. Recorded days are not assumed complete.
export function analyzeSpending(
  data: Omit<
    SpendingInsights,
    "averagePerEntry" | "suggestions" | "observations"
  >,
): SpendingInsights {
  const observations: string[] = [];
  if (!data.count)
    observations.push("ยังไม่มีรายจ่ายที่บันทึกใน 30 วันนี้ จึงยังวิเคราะห์แพทเทิร์นไม่ได้");
  else {
    observations.push(
      `จากรายการที่จด ${data.count} รายการ ใน ${data.activeDays} วันที่มีรายการ รวม ${formatBaht(data.total)} บาท ใน 30 วัน`,
    );
    observations.push(
      `7 วันล่าสุดจด ${formatBaht(data.recentWeek)} บาท เทียบกับ 7 วันก่อนหน้า ${formatBaht(data.previousWeek)} บาท วันนี้อาจยังจดไม่ครบ และช่วงที่ไม่มีรายการอาจเป็นการจดตกหล่น`,
    );
    for (const r of data.recurring)
      observations.push(
        `พบ “${r.label}” ${r.count} ครั้ง ใน ${r.days} วัน รวม ${formatBaht(r.amount)} บาท ลองตรวจว่ารายการนี้ควรมีงบแยกหรือไม่`,
      );
  }
  for (const c of data.categories)
    if (c.monthlyBudget !== null && c.spent > c.monthlyBudget)
      observations.push(
        `หมวด ${c.label} เดือนนี้จดเกินงบที่ตั้งไว้ ${formatBaht(c.spent - c.monthlyBudget)} บาท ลองทบทวนรายการและปรับแผน โดยคงค่าใช้จ่ายจำเป็นไว้`,
      );
  const suggestions = data.categories
    .filter((c) => c.spent > 0 && c.monthlyBudget === null)
    .slice(0, 5)
    .map((c) => ({
      categoryId: c.id,
      label: c.label,
      amount: c.spent,
      reason:
        "ใช้ยอดที่จดเดือนนี้เป็นจุดเริ่มตั้งงบ ไม่ใช่ประมาณการเต็มเดือนหรือจำนวนเงินที่รับรองว่าใช้ไหว ปรับตามเงินและค่าใช้จ่ายจำเป็นก่อนยืนยัน",
    }));
  return {
    ...data,
    averagePerEntry: data.count ? Math.round(data.total / data.count) : 0,
    suggestions,
    observations,
  };
}
