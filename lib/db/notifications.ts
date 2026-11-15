import { getDb } from "./client";
import {
  DEFAULT_NOTIFICATIONS,
  type NotificationPreferences,
} from "@/lib/reports/types";
import { HttpError } from "@/lib/http";
export function parseNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  const v = value as Partial<NotificationPreferences> | null;
  if (
    !v ||
    [v.daily, v.monthly, v.budget].some((x) => typeof x !== "boolean") ||
    typeof v.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)
  )
    throw new HttpError(
      422,
      "invalid_input",
      "เลือกการแจ้งเตือนและเวลาให้ถูกต้องครับ",
    );
  return {
    daily: v.daily!,
    monthly: v.monthly!,
    budget: v.budget!,
    time: v.time,
  };
}
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await getDb()
    .from("notification_preferences")
    .select("daily,monthly,budget,send_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        daily: data.daily,
        monthly: data.monthly,
        budget: data.budget,
        time: data.send_at.slice(0, 5),
      }
    : { ...DEFAULT_NOTIFICATIONS };
}
export async function saveNotificationPreferences(
  userId: string,
  input: unknown,
): Promise<NotificationPreferences> {
  const p = parseNotificationPreferences(input);
  const { error } = await getDb().from("notification_preferences").upsert({
    user_id: userId,
    daily: p.daily,
    monthly: p.monthly,
    budget: p.budget,
    send_at: p.time,
  });
  if (error) throw error;
  return p;
}
