// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { PromotionMockView } from "./promotion-mock-view";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("labels every campaign as synthetic and claiming a demo code makes no network call", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<PromotionMockView />);
  expect(screen.getByText(/ทั้งหมดเป็นข้อมูลจำลอง/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "คูปอง" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "ลองรับรหัสตัวอย่าง" }));
  expect(
    screen
      .getAllByRole("status")
      .some((s) => s.textContent?.includes("ใช้ซื้อจริงไม่ได้")),
  ).toBe(true);
  expect(screen.getByText("DEMO-MEAL49")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
