import { requireUser } from "@/lib/auth";
import { recordBalanceCheck } from "@/lib/db/balance";
import { loadSummary } from "@/lib/db/budget";
import { errorResponse, readJson } from "@/lib/http";
import { parseBalanceCheck } from "@/lib/validate";

// "ปรับยอด": always the caller's own active cycle; any cycle id in the body is ignored
export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const check = parseBalanceCheck(await readJson(request), new Date());
    await recordBalanceCheck(userId, check);
    return Response.json({ summary: await loadSummary(userId) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
