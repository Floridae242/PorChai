import type { Satang } from "../calc/money";

// Display helper: server-computed satang -> Thai baht string. Never computes budgets.
export function formatBaht(satang: Satang): string {
  if (!Number.isSafeInteger(satang)) {
    throw new RangeError(`satang must be a safe integer, got ${satang}`);
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

// Satang -> text for an <input> (what parseBahtInput accepts back): no thousands separators, no
// trailing zeros (4550 -> "45.5", 4500 -> "45"). Inputs are never negative.
export function satangToInputString(satang: Satang): string {
  if (!Number.isSafeInteger(satang) || satang < 0) {
    throw new RangeError(`satang must be a non-negative safe integer, got ${satang}`);
  }
  const whole = Math.floor(satang / 100);
  const frac = satang % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
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
      reason:
        | "empty"
        | "not_number"
        | "not_positive"
        | "too_many_decimals"
        | "too_large";
    };

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

// Parse user-typed baht into integer satang using string math (no float error).
export function parseBahtInput(text: string): ParseBahtResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };

  const normalized = trimmed.replace(/[๐-๙]/g, (c) =>
    String(THAI_DIGITS.indexOf(c)),
  );

  // Commas are only valid as proper thousands grouping (1,234,567).
  const match = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d*))?$/.exec(normalized);
  if (!match) return { ok: false, reason: "not_number" };

  const [, minus, wholeRaw, fracRaw] = match;
  if (wholeRaw === undefined && !fracRaw)
    return { ok: false, reason: "not_number" };
  const frac = fracRaw ?? "";
  if (frac.length > 2) return { ok: false, reason: "too_many_decimals" };

  const big =
    BigInt((wholeRaw ?? "0").replace(/,/g, "")) * BigInt(100) +
    BigInt(frac.padEnd(2, "0"));
  if (minus || big <= BigInt(0)) return { ok: false, reason: "not_positive" };
  if (big > BigInt(Number.MAX_SAFE_INTEGER))
    return { ok: false, reason: "too_large" };
  return { ok: true, satang: Number(big) };
}
