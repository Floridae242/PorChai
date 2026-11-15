import { requireUser } from "@/lib/auth";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/db/notifications";
import { errorResponse, readJson } from "@/lib/http";
export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json(await getNotificationPreferences(userId));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json(
      await saveNotificationPreferences(userId, await readJson(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
