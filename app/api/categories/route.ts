import { requireUser } from "@/lib/auth";
import { readJson, errorResponse } from "@/lib/http";
import {
  spendingCategories,
  saveSpendingCategory,
} from "@/lib/db/spending-categories";
export async function GET(request: Request) {
  try {
    const { userId } = await requireUser(request);
    return Response.json(await spendingCategories(userId));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    const { userId } = await requireUser(request);
    return Response.json(
      await saveSpendingCategory(userId, await readJson(request)),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
