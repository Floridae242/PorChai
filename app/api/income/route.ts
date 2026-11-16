import { requireUser } from "@/lib/auth";
import { thaiDate } from "@/lib/calc/time";
import { loadSummary } from "@/lib/db/budget";
import type { IncomesResponse } from "@/lib/api-types";
import { addIncome, listIncomes } from "@/lib/db/income";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { parseNewIncome } from "@/lib/validate";

// แผนเงิน › รายรับ: this cycle's incomes from the chat and the app
export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json({ incomes: await listIncomes(userId) } satisfies IncomesResponse);
  } catch (err) {
    return errorResponse(err);
  }
}

// รายรับ: แอป › จด › รายรับ (lib/client addIncome). Needs an Idempotency-Key like POST /api/entries.
export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const key = request.headers.get("idempotency-key")?.trim();
    if (!key || key.length > 100) {
      throw new HttpError(400, "missing_idempotency_key", "คำขอไม่ถูกต้อง ลองใหม่อีกครั้ง");
    }
    const { created } = await addIncome(userId, parseNewIncome(await readJson(request), thaiDate(new Date())), key, "form");
    return Response.json({ summary: await loadSummary(userId) }, { status: created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
