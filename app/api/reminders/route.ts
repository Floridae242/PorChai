import { requireUser } from "@/lib/auth";
import { getReminderSettings, saveReminderSettings } from "@/lib/db/reminders";
import { errorResponse, readJson } from "@/lib/http";
import { parseReminderSettings } from "@/lib/validate";

// Card 58: แอป › ตั้งค่า › การเตือน — on/off, time, pause, and the habits found
export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json(await getReminderSettings(userId));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json(await saveReminderSettings(userId, parseReminderSettings(await readJson(request))));
  } catch (err) {
    return errorResponse(err);
  }
}
