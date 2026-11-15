// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OnboardingPreview } from "./preview";
import { buildOnboardingCarousel } from "@/lib/line/onboarding";
afterEach(cleanup);
it("lets the user review all ten cards and their exact JSON without sending a command", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  try {
    render(<OnboardingPreview message={buildOnboardingCarousel()} />);
    expect(screen.getAllByRole("article")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "ดูครบทุกการ์ด" }));
    expect(
      screen
        .getByRole("button", { name: "ดูครบทุกการ์ด" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "ดูวิธีจด" }));
    expect(screen.getByText(/ปุ่มคู่มือยังไม่ได้บันทึกหรือเปลี่ยนข้อมูล/)).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
