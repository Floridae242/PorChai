import type { Satang } from "../calc/money";

// Display helper: server-computed satang -> Thai baht string. Never computes budgets.
export function formatBaht(satang: Satang): string {
  if (!Number.isInteger(satang)) {
    throw new RangeError(`satang must be an integer, got ${satang}`);
  }
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(satang);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeText = new Intl.NumberFormat("en-US", {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(whole);
  return frac === 0
    ? `${sign}${wholeText}`
    : `${sign}${wholeText}.${String(frac).padStart(2, "0")}`;
}

export function formatBahtOrUnknown(
  satang: Satang | null,
  unknownLabel: string,
): string {
  return satang === null ? unknownLabel : formatBaht(satang);
}

export type ParseBahtResult =
  | { ok: true; satang: Satang }
  | {
      ok: false;
      reason: "empty" | "not_number" | "not_positive" | "too_many_decimals";
    };

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

// Parse user-typed baht into integer satang using string math (no float error).
export function parseBahtInput(text: string): ParseBahtResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };

  const normalized = trimmed
    .replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)))
    .replace(/,/g, "");

  const match = /^(-)?(\d+)(?:\.(\d*))?$/.exec(normalized);
  if (!match) return { ok: false, reason: "not_number" };

  const [, minus, whole, fracRaw = ""] = match;
  if (fracRaw.length > 2) return { ok: false, reason: "too_many_decimals" };

  const satang = Number(whole) * 100 + Number(fracRaw.padEnd(2, "0"));
  if (minus || satang <= 0) return { ok: false, reason: "not_positive" };
  if (!Number.isSafeInteger(satang)) return { ok: false, reason: "not_number" };
  return { ok: true, satang };
}
