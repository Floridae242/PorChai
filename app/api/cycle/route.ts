import { requireUser } from "@/lib/auth";
import { thaiDate } from "@/lib/calc/time";
import { loadSummary } from "@/lib/db/budget";
import { createCycle } from "@/lib/db/cycle";
import { errorResponse, readJson } from "@/lib/http";
import { parseNewCycle } from "@/lib/validate";

// W4–W9: set up a cycle (income, payday, balance, bills, savings, buffer, essentials, postponable items)
export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const now = new Date();
    const today = thaiDate(now);
    const cycle = parseNewCycle(await readJson(request), today, now);
    await createCycle(userId, cycle, today);
    return Response.json({ summary: await loadSummary(userId) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
