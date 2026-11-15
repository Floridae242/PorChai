import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { spendingInsights } from "@/lib/db/spending-insights";
import { suggestSpending } from "@/lib/ai/spending-suggestions";
import { withAiScope } from "@/lib/ai/admission";
export async function GET(request: Request) {
  try {
    const { userId } = await requireUser(request);
    const data = await spendingInsights(userId);
    if (new URL(request.url).searchParams.get("ai") === "1")
      data.aiText = await withAiScope(userId, () => suggestSpending(data));
    return Response.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
