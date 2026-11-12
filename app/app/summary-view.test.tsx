// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shell/toast";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";

const replace = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

import { SummaryView } from "./summary-view";

describe("SummaryView (G04: B1, B1m, B1k, S4, S10)", () => {
  beforeEach(() => {
    replace.mockClear();
    currentSearch = "";
  });
  afterEach(cleanup);

  it("renders B1 daily budget 120 baht and claims daily point (B1k)", async () => {
    const api = createMockApi({ scenario: "default" });
    render(
      <ApiContext.Provider value={api}>
        <ToastProvider>
          <SummaryView />
        </ToastProvider>
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();

    expect(await screen.findByText("120")).toBeTruthy();
    expect(screen.getByText("11 แต้ม")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "รับแต้มฟรี" }));
    expect(await screen.findByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeTruthy();
    expect(screen.getByText("รับแต้มฟรีแล้ว +1 · รวม 12 แต้ม")).toBeTruthy();
  });

  it("switches to 12-day cycle chart (B1m) and marks overspent day with เกิน", async () => {
    const api = createMockApi({ scenario: "midCycle" });
    render(
      <ApiContext.Provider value={api}>
        <ToastProvider>
          <SummaryView />
        </ToastProvider>
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();

    expect(await screen.findByText("75")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "ใช้ไปแต่ละวัน" }));
    expect(screen.getByText("เกิน")).toBeTruthy();
    expect(screen.getByText("180")).toBeTruthy();
  });

  it("redirects to /app/setup/income when user has no active cycle", async () => {
    const api = createMockApi({ scenario: "fresh", consented: true });
    render(
      <ApiContext.Provider value={api}>
        <ToastProvider>
          <SummaryView />
        </ToastProvider>
      </ApiContext.Provider>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/setup/income"));
  });
});
