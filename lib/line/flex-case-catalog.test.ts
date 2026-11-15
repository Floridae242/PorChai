import { expect, it, vi, afterEach } from "vitest";
import { flexCaseCatalog } from "./flex-case-catalog";
afterEach(() => vi.unstubAllGlobals());
it("covers onboarding, spending, receipts, planning, reporting and recoverable states without network or account data", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const cases = flexCaseCatalog();
  expect(cases.length).toBeGreaterThanOrEqual(40);
  expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  for (const id of [
    "welcome",
    "today-live",
    "record-live",
    "record-over",
    "income-live",
    "many-preview",
    "many-saved",
    "ocr-draft",
    "reminder-live",
    "setup-chat",
    "category-preview",
    "category-saved",
    "report-day",
    "report-empty",
    "insights",
    "search-found",
    "search-empty",
    "points-auto",
    "reward-empty",
    "reward-insufficient",
    "notify-preview",
    "installment-preview",
    "installment-invalid",
    "stale",
    "expired",
    "cancelled",
    "already-done",
    "promo-demo",
    "ai-unavailable",
  ])
    expect(
      cases.some((c) => c.id === id),
      id,
    ).toBe(true);
  for (const { message } of cases) {
    expect(message.type).toBe("flex");
    expect(message.altText.length).toBeGreaterThan(0);
    expect(message.altText.length).toBeLessThanOrEqual(400);
    expect(Buffer.byteLength(JSON.stringify(message.contents))).toBeLessThan(
      message.contents.type === "carousel" ? 50 * 1024 : 30 * 1024,
    );
    const check = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(check);
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        if (v.type === "postback") expect(v.data).toMatch(/^preview:/);
        Object.values(v).forEach(check);
      }
    };
    check(message);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
