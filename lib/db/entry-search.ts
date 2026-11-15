import { getDb } from "./client";
import { reportReads } from "./report-reads";
import { addDays, thaiDate } from "@/lib/calc/time";
import { HttpError } from "@/lib/http";
import { formatBaht } from "@/lib/format/money";
import type { SearchResult } from "@/lib/reports/types";

export async function searchEntries(
  userId: string,
  query: string,
  period: "day" | "month" | "year" = "month",
): Promise<SearchResult> {
  query = query.trim();
  if (!query || query.length > 120)
    throw new HttpError(
      422,
      "invalid_input",
      "ระบุชื่อรายการที่ต้องการค้นหา ไม่เกิน 120 ตัวอักษรครับ",
    );
  const today = thaiDate(new Date());
  const from =
    period === "day"
      ? today
      : period === "year"
        ? addDays(today, -365)
        : `${today.slice(0, 7)}-01`;
  const { data, error } = await reportReads.run(
    async () =>
      await getDb()
        .rpc("entry_search", {
          p_user: userId,
          p_query: query,
          p_from: from,
          p_until: addDays(today, 1),
        })
        .abortSignal(AbortSignal.timeout(5000)),
  );
  if (error) throw error;
  if (!Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.count))
    throw new Error("Unsafe search totals");
  return {
    mode: "entries",
    sources: [],
    ...data,
    answer: `พบ ${data.count} รายการที่มีคำว่า “${query}” รวม ${formatBaht(data.total)} บาท ในช่วง ${from} ถึง ${today}${data.count > 50 ? " · แสดง 50 รายการแรก" : ""}`,
  };
}
