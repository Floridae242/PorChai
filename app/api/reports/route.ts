import { requireUser } from "@/lib/auth";
import { loadReport } from "@/lib/db/reports";
import { errorResponse } from "@/lib/http";
export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const params = new URL(request.url).searchParams;
    return Response.json(
      await loadReport(
        userId,
        params.get("period") ?? "month",
        params.get("date") ?? undefined,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
