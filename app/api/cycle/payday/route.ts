import { requireUser } from "@/lib/auth";
import { thaiDate } from "@/lib/calc/time";
import { loadSummary } from "@/lib/db/budget";
import { setPayday } from "@/lib/db/cycle";
import { errorResponse, readJson } from "@/lib/http";
import { parsePaydayChange } from "@/lib/validate";

// Card 23: confirm a moved payday after seeing it (POST /api/simulate { payday }); basis required
export async function PUT(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    await setPayday(userId, parsePaydayChange(await readJson(request), thaiDate(new Date())));
    return Response.json({ summary: await loadSummary(userId) });
  } catch (err) {
    return errorResponse(err);
  }
}
