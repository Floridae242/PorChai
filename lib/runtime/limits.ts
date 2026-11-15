export function positiveLimit(value: string | undefined, fallback: number, ceiling: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= ceiling ? n : fallback;
}
