import type { PlanResponse, PlansResponse } from "@/lib/api-types";
import { requireUser } from "@/lib/auth";
import { loadSummary } from "@/lib/db/budget";
import { addPlan, listPlans } from "@/lib/db/plans";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { parseNewPlan } from "@/lib/validate";

// W16 แผนของฉัน
export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json({ plans: await listPlans(userId) } satisfies PlansResponse);
  } catch (err) {
    return errorResponse(err);
  }
}

// W15 เก็บไว้ในแผน / เลื่อนไปรอบหน้า: holds money back (or not yet), spends nothing
export async function POST(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const key = request.headers.get("idempotency-key")?.trim();
    if (!key || key.length > 100) {
      throw new HttpError(400, "missing_idempotency_key", "คำขอไม่ถูกต้อง ลองใหม่อีกครั้ง");
    }
    const input = parseNewPlan(await readJson(request));
    const { plan, created } = await addPlan(userId, input, key);
    const body: PlanResponse = { plan, summary: await loadSummary(userId) };
    return Response.json(body, { status: created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
