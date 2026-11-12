import { requireUser } from "@/lib/auth";
import { loadSummary } from "@/lib/db/budget";
import { setBuffer } from "@/lib/db/cycle";
import { errorResponse, readJson } from "@/lib/http";
import { parseBufferChange } from "@/lib/validate";

// Card 19: confirm a new emergency buffer after seeing it on the summary screen (POST /api/simulate)
export async function PUT(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    await setBuffer(userId, parseBufferChange(await readJson(request)));
    return Response.json({ summary: await loadSummary(userId) });
  } catch (err) {
    return errorResponse(err);
  }
}
