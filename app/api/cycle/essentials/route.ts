import { requireUser } from "@/lib/auth";
import { loadSummary } from "@/lib/db/budget";
import { setEssentials } from "@/lib/db/cycle";
import { errorResponse, readJson } from "@/lib/http";
import { parseEssentials } from "@/lib/validate";

// W7 food + transport a day, set after setup — the answer to a try's needs: ["essentials"]
export async function PUT(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    await setEssentials(userId, parseEssentials(await readJson(request)));
    return Response.json({ summary: await loadSummary(userId) });
  } catch (err) {
    return errorResponse(err);
  }
}
