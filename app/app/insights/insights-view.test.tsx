// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";
import { InsightsView } from "./insights-view";
afterEach(cleanup);
it("shows honest empty analysis and never automatically requests AI", async () => {
  const api = createMockApi({ scenario: "fresh", consented: true }),
    insights = vi.spyOn(api, "spendingInsights");
  render(
    <ApiContext.Provider value={api}>
      <InsightsView />
    </ApiContext.Provider>,
  );
  await screen.findByText("ข้อสังเกตจากข้อมูลที่จด");
  expect(insights).toHaveBeenCalledWith();
  expect(insights).not.toHaveBeenCalledWith(true);
});
it("retains factual summary when an explicit AI request fails", async () => {
  const api = createMockApi();
  await api.addEntry({ amount: 5000, category: "food", note: "ข้าว" }, "test");
  const original = api.spendingInsights;
  vi.spyOn(api, "spendingInsights").mockImplementation((ai) =>
    ai ? Promise.reject(new Error("offline")) : original(),
  );
  render(
    <ApiContext.Provider value={api}>
      <InsightsView />
    </ApiContext.Provider>,
  );
  await screen.findByText("ข้อสังเกตจากข้อมูลที่จด");
  fireEvent.click(screen.getByRole("button", { name: /AI/ }));
  await screen.findByText(/ขอคำอธิบาย AI ไม่สำเร็จ/);
  expect(screen.getByText("งบรายหมวดเดือนนี้")).toBeTruthy();
});
it("failed data fetch offers retry without fabricated charts", async () => {
  const api = createMockApi();
  vi.spyOn(api, "spendingInsights").mockRejectedValue(new Error("offline"));
  render(
    <ApiContext.Provider value={api}>
      <InsightsView />
    </ApiContext.Provider>,
  );
  await screen.findByText("โหลดข้อมูลพฤติกรรมไม่สำเร็จ");
  expect(screen.queryByText("งบรายหมวดเดือนนี้")).toBeNull();
  expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
});
