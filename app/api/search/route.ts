import { requireUser } from "@/lib/auth";
import { withAiScope } from "@/lib/ai/admission";
import { groundedSearch } from "@/lib/ai/gemini";
import { searchEntries } from "@/lib/db/entry-search";
import { errorResponse, HttpError, readJson } from "@/lib/http";
export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const input = (await readJson(request)) as {
      query?: unknown;
      mode?: unknown;
      period?: unknown;
    } | null;
    if (
      !input ||
      typeof input.query !== "string" ||
      !input.query.trim() ||
      input.query.length > 240 ||
      !["entries", "web"].includes(String(input.mode)) ||
      (input.period !== undefined &&
        !["day", "month", "year"].includes(String(input.period)))
    )
      throw new HttpError(422, "invalid_input", "ระบุคำค้นและช่วงเวลาที่ถูกต้องครับ");
    const query = input.query.trim();
    if (input.mode === "web") {
      if (process.env.GEMINI_WEB_SEARCH_ENABLED !== "1")
        throw new HttpError(
          503,
          "web_search_disabled",
          "ค้นเว็บยังไม่เปิดใช้งาน ค้นรายจ่ายของคุณได้ตามปกติครับ",
        );
      const result = await withAiScope(userId, () => groundedSearch(query));
      if (!result)
        throw new HttpError(
          503,
          "search_unavailable",
          "ยังค้นเว็บพร้อมแหล่งอ้างอิงไม่ได้ ลองใหม่อีกครั้งครับ",
        );
      return Response.json(result);
    }
    return Response.json(
      await searchEntries(
        userId,
        query,
        (input.period ?? "month") as "day" | "month" | "year",
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
