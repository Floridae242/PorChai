// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "@/lib/client/mock";
import { clearSetupDraft, createDefaultSetupDraft, saveSetupDraft } from "@/lib/client/setup-draft";
import { ApiContext } from "@/lib/client/use-api";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

import SetupBalancePage from "./balance/page";
import SetupReviewPage from "./review/page";

describe("Onboarding Setup Flow (G02 & G03)", () => {
  beforeEach(() => {
    clearSetupDraft();
    push.mockClear();
    replace.mockClear();
  });
  afterEach(cleanup);

  it("changes bill status to separate and updates unpaid bill total from 600 to 200", async () => {
    const api = createMockApi({ scenario: "fresh", consented: true });
    render(
      <ApiContext.Provider value={api}>
        <SetupBalancePage />
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();
    expect(screen.getByText("600 บาท")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "แก้ไข ค่าหอ" }));
    await user.click(screen.getByRole("button", { name: "จ่ายแยก" }));
    await user.click(screen.getByRole("button", { name: "บันทึก" }));

    expect(screen.getByText("200 บาท")).toBeTruthy();
  });

  it("displays Figma default 120 บาท/วัน and 600 บาท maxPurchase on review (A4) and submits createCycle", async () => {
    const api = createMockApi({ scenario: "fresh", consented: true });
    const spy = vi.spyOn(api, "createCycle");
    render(
      <ApiContext.Provider value={api}>
        <SetupReviewPage />
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("600 บาท")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "เริ่มใช้แผนนี้" }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/app?toast=saved");
  });

  it("displays shortfall state (A5a) when bills exceed balance", () => {
    const draft = createDefaultSetupDraft();
    draft.balance = 50000; // 500 baht
    draft.savingsMode = "amount"; // fixed 240 baht savings
    saveSetupDraft(draft);
    const api = createMockApi({ scenario: "fresh", consented: true });
    render(
      <ApiContext.Provider value={api}>
        <SetupReviewPage />
      </ApiContext.Provider>,
    );
    expect(screen.getByText("ยอดที่ขาดในรอบนี้")).toBeTruthy();
    expect(screen.getByText("460")).toBeTruthy();
  });
});
