// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HelpView } from "./help-view";
import { buildOnboardingCarousel } from "@/lib/line/onboarding";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  cleanup();
  push.mockClear();
});
it("keeps help available in MINI App without preview tools or financial mutations", () => {
  render(<HelpView message={buildOnboardingCarousel()} />);
  expect(screen.getAllByRole("article")).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "ดูวิธีจด" }));
  expect(screen.getByRole("status").textContent).toContain(
    "ยังไม่ได้บันทึกหรือเปลี่ยนข้อมูล",
  );
  expect(push).not.toHaveBeenCalled();
  expect(screen.queryByText("พรีวิวก่อน commit")).toBeNull();
  expect(screen.queryByText(/JSON สำหรับ Simulator/)).toBeNull();
});
it("opens actual related screens through internal navigation", () => {
  render(<HelpView message={buildOnboardingCarousel()} />);
  fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าใน MINI App" }));
  expect(push).toHaveBeenCalledWith("/app/setup/income");
  const appButtons = screen.getAllByRole("button", { name: "ดูใน MINI App" });
  fireEvent.click(appButtons[1]);
  expect(push).toHaveBeenLastCalledWith("/app/record/new?type=income");
});
