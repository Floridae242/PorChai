import { HttpError } from "@/lib/http";
import type { NewBillSchedule } from "./types";

export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 2000 &&
    Number(value.slice(0, 4)) <= 2100 &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function monthDue(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, "0")}`;
}
export function moveMonth(month: string, step: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 7);
}
export function parseBillSchedule(
  value: unknown,
  today: string,
  allowPast = false,
): NewBillSchedule {
  const v = value as Partial<NewBillSchedule> | null;
  if (
    !v ||
    typeof v.title !== "string" ||
    !v.title.trim() ||
    v.title.trim().length > 80 ||
    !Number.isSafeInteger(v.amount) ||
    v.amount! <= 0 ||
    v.amount! > 10_000_000 ||
    !validDate(v.startsOn) ||
    (!allowPast && v.startsOn < today) ||
    v.startsOn > `${Number(today.slice(0, 4)) + 1}${today.slice(4)}` ||
    !["once", "monthly"].includes(v.repeat ?? "") ||
    typeof v.notify !== "boolean"
  )
    throw new HttpError(
      422,
      "invalid_input",
      "ใส่ชื่อบิล ยอด 0.01–100,000 บาท และวันครบกำหนดตั้งแต่วันนี้ไม่เกิน 1 ปีให้ถูกต้องครับ",
    );
  return {
    title: v.title.trim(),
    amount: v.amount!,
    startsOn: v.startsOn,
    repeat: v.repeat!,
    notify: v.notify,
  };
}
