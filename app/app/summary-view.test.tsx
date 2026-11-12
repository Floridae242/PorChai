// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shell/toast";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

const replace = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

import { SummaryView } from "./summary-view";

const notImplemented = () => new ApiError(501, "not_implemented", "ยังไม่พร้อมใช้งาน");

function renderSummary(api: PorchaiApi) {
  return render(
    <ApiContext.Provider value={api}>
      <ToastProvider>
        <SummaryView />
      </ToastProvider>
    </ApiContext.Provider>,
  );
}

describe("SummaryView (G04: B1, B1m, B1k, S4, S10)", () => {
  beforeEach(() => {
    replace.mockClear();
    currentSearch = "";
  });
  afterEach(cleanup);

  it("renders B1 daily budget 120 baht and claims daily point with the server number (B1k)", async () => {
    const api = createMockApi({ scenario: "default" });
    renderSummary(api);
    const user = userEvent.setup();

    expect(await screen.findByText("120")).toBeTruthy();
    expect(screen.getByText("11 แต้ม")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "รับแต้มฟรี" }));
    expect(await screen.findByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeTruthy();
    expect(screen.getByText("รับแต้มฟรีแล้ว +1 · รวม 12 แต้ม")).toBeTruthy();
    expect(screen.getByText("12 แต้ม")).toBeTruthy();
  });

  it("shows the server's number even when it is not previous + 1", async () => {
    const api = createMockApi({ scenario: "default" });
    vi.spyOn(api, "claimPoints").mockResolvedValue({ balance: 40, claimedToday: true });
    renderSummary(api);
    await userEvent.setup().click(await screen.findByRole("button", { name: "รับแต้มฟรี" }));
    expect(await screen.findByText("รับแต้มฟรีแล้ว +1 · รวม 40 แต้ม")).toBeTruthy();
    expect(screen.getByText("40 แต้ม")).toBeTruthy();
  });

  it("points that fail to load or are not implemented show 0 แต้ม, never a guess", async () => {
    for (const rejection of [notImplemented(), new Error("down")]) {
      const api = createMockApi({ scenario: "default" });
      vi.spyOn(api, "points").mockRejectedValue(rejection);
      const { unmount } = renderSummary(api);
      expect(await screen.findByText("0 แต้ม")).toBeTruthy();
      expect(screen.queryByText("11 แต้ม")).toBeNull();
      unmount();
    }
  });

  it("claim on a not-implemented backend says ยังไม่พร้อมใช้งาน and leaves points unchanged", async () => {
    const api = createMockApi({ scenario: "default" });
    vi.spyOn(api, "points").mockRejectedValue(notImplemented());
    const claimSpy = vi.spyOn(api, "claimPoints").mockRejectedValue(notImplemented());
    renderSummary(api);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "รับแต้มฟรี" }));
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    expect(screen.getByText("0 แต้ม")).toBeTruthy();
    expect(screen.queryByText("รับแต้มฟรีแล้ววันนี้ ✓")).toBeNull();

    // retry reuses the same key (same payload)
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "รับแต้มฟรี" }) as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "รับแต้มฟรี" }));
    await waitFor(() => expect(claimSpy).toHaveBeenCalledTimes(2));
    expect(claimSpy.mock.calls[0][0]).toBe(claimSpy.mock.calls[1][0]);
  });

  it("a double tap on รับแต้มฟรี sends one claim", async () => {
    const api = createMockApi({ scenario: "default" });
    const spy = vi.spyOn(api, "claimPoints");
    renderSummary(api);
    await userEvent.setup().dblClick(await screen.findByRole("button", { name: "รับแต้มฟรี" }));
    await screen.findByText("รับแต้มฟรีแล้ววันนี้ ✓");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("switches to the server's daily chart (B1m) and marks overspent day with เกิน", async () => {
    const api = createMockApi({ scenario: "midCycle" });
    renderSummary(api);
    const user = userEvent.setup();

    expect(await screen.findByText("75")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "ใช้ไปแต่ละวัน" }));
    expect(screen.getByText("เกิน")).toBeTruthy();
    expect(screen.getByText("180")).toBeTruthy();
  });

  it("draws the chart from api.dailySpend() values, not from entries", async () => {
    const api = createMockApi({ scenario: "midCycle" });
    const base = await api.dailySpend();
    vi.spyOn(api, "dailySpend").mockResolvedValue({
      days: base.days.map((d, i) => (i === 0 ? { ...d, spent: 77700, over: true } : d)),
    });
    renderSummary(api);
    await screen.findByText("75");
    await userEvent.setup().click(screen.getByRole("tab", { name: "ใช้ไปแต่ละวัน" }));
    expect(screen.getByText("777")).toBeTruthy();
  });

  it("hides the view toggle and the chart when dailySpend is not implemented", async () => {
    const api = createMockApi({ scenario: "midCycle" });
    vi.spyOn(api, "dailySpend").mockRejectedValue(notImplemented());
    renderSummary(api);
    expect(await screen.findByText("75")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "ใช้ไปแต่ละวัน" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "เหลือใช้วันนี้" })).toBeNull();
    expect(screen.queryByText("เกิน")).toBeNull();
  });

  it("shows category totals from api.categoryTotals() and hides the card when not implemented", async () => {
    const api = createMockApi({ scenario: "midCycle" });
    vi.spyOn(api, "categoryTotals").mockResolvedValue({
      items: [{ category: "transport", amount: 123400, count: 7 }],
    });
    const { unmount } = renderSummary(api);
    expect(await screen.findByText("เดินทาง (7)")).toBeTruthy();
    expect(screen.getByText("1,234 บาท")).toBeTruthy();
    unmount();

    const api2 = createMockApi({ scenario: "midCycle" });
    vi.spyOn(api2, "categoryTotals").mockRejectedValue(notImplemented());
    renderSummary(api2);
    await screen.findByText("75");
    expect(screen.queryByText("ใช้ไปกับอะไร")).toBeNull();
  });

  it("redirects to /app/setup/income on no_cycle without flashing an error", async () => {
    const api = createMockApi({ scenario: "fresh", consented: true });
    renderSummary(api);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/setup/income"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "ลองใหม่" })).toBeNull();
    expect(screen.getByText("กำลังคำนวณเงินที่ใช้ได้วันนี้…")).toBeTruthy();
  });

  it("redirects to /app/consent on no_consent", async () => {
    const api = createMockApi({ scenario: "default", consented: false });
    renderSummary(api);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/consent"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("other failures show the error banner with ลองใหม่, which reloads", async () => {
    const api = createMockApi({ scenario: "default" });
    vi.spyOn(api, "summary").mockRejectedValueOnce(new Error("down"));
    renderSummary(api);
    const user = userEvent.setup();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("120")).toBeTruthy();
  });

  it("shows the supplied mascot and real receipt links with recorded entries", async () => {
    const api = createMockApi({ scenario: "midCycle" });
    const { container } = renderSummary(api);
    await screen.findByText("75");
    expect(container.querySelector('img[src="/mascot/budgetOk.png"]')).not.toBeNull();
    const { entries } = await api.entries();
    for (const entry of entries.slice(0, 5)) {
      expect(container.querySelector(`a[href="/app/record/${entry.id}"]`)).not.toBeNull();
    }
  });

  it("shows the empty-state greeting mascot (S1) when there are no entries", async () => {
    const api = createMockApi({ scenario: "default" });
    const { container } = renderSummary(api);
    await screen.findByText(/วันนี้ยังไม่มีรายการจด/);
    expect(container.querySelector('img[src="/mascot/greeting.png"]')).not.toBeNull();
  });
});
