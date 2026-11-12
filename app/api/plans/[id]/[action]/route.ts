import type { PlanResponse } from "@/lib/api-types";
import { requireUser } from "@/lib/auth";
import { thaiDate } from "@/lib/calc/time";
import { loadSummary } from "@/lib/db/budget";
import { actOnPlan, PLAN_ACTIONS, type PlanAction } from "@/lib/db/plans";
import { errorResponse, HttpError, readOptionalJson } from "@/lib/http";
import { parsePayPlan } from "@/lib/validate";

// pay (จ่ายแล้ว) · unpay (ยกเลิกการจ่าย) · cancel (ยกเลิก) · postpone (เลื่อนไปรอบหน้า) · keep (เก็บไว้ในแผน)
export async function POST(request: Request, ctx: RouteContext<"/api/plans/[id]/[action]">): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const { id, action } = await ctx.params;
    if (!PLAN_ACTIONS.includes(action as PlanAction)) throw new HttpError(404, "not_found", "ไม่พบคำสั่งนี้");
    const { category } = action === "pay" ? parsePayPlan(await readOptionalJson(request)) : { category: null };
    const plan = await actOnPlan(userId, id, action as PlanAction, category, thaiDate(new Date()));
    return Response.json({ plan, summary: await loadSummary(userId) } satisfies PlanResponse);
  } catch (err) {
    return errorResponse(err);
  }
}
