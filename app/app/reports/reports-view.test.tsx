// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";
import { ReportsView } from "./reports-view";
afterEach(cleanup);
it("loads real API report values and switches to a historical daily report", async () => {
  const api = createMockApi({ consented: true });
  const report = vi.spyOn(api, "report");
  render(
    <ApiContext.Provider value={api}>
      <ReportsView />
    </ApiContext.Provider>,
  );
  await screen.findByRole("heading", { name: "แยกตามหมวด" });
  expect(report).toHaveBeenCalledWith("month", undefined);
  fireEvent.click(screen.getByRole("button", { name: "รายวัน" }));
  fireEvent.change(screen.getByLabelText("เลือกวันที่"), {
    target: { value: "2026-11-01" },
  });
  await waitFor(() =>
    expect(report).toHaveBeenLastCalledWith("day", "2026-11-01"),
  );
  await screen.findByText("ยังไม่มีรายการที่จดในช่วงนี้");
});
it("shows a retryable error instead of fabricated zero data", async () => {
  const api = createMockApi({ consented: true });
  vi.spyOn(api, "report").mockRejectedValue(new Error("offline"));
  render(
    <ApiContext.Provider value={api}>
      <ReportsView />
    </ApiContext.Provider>,
  );
  await screen.findByText("โหลดรายงานไม่สำเร็จ ลองใหม่อีกครั้ง");
  expect(screen.getByRole("button", { name: "ลองใหม่" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "แยกตามหมวด" })).toBeNull();
});

// 16 Nov: the teacher asked what the green bar is and whether income and spending can be seen apart
it("shows income and spending per day with a legend, and switches between all, spending and income", async () => {
  const api = createMockApi({ consented: true });
  await api.addIncome({ amount: 30000, note: "แม่โอนให้" }, "i-1");
  await api.addEntry({ amount: 4500, category: "food", note: "ข้าว" }, "e-1");
  render(
    <ApiContext.Provider value={api}>
      <ReportsView />
    </ApiContext.Provider>,
  );
  await screen.findByRole("heading", { name: "รายรับและรายจ่ายแต่ละวัน" });
  // a legend names both colours
  const chart = screen.getByRole("region", { name: "รายรับและรายจ่ายแต่ละวัน" });
  expect(within(chart).getAllByText("รายรับ").length).toBeGreaterThan(0);
  expect(within(chart).getAllByText("รายจ่าย").length).toBeGreaterThan(0);
  // the day that has both says both
  expect(screen.getByRole("button", { name: /รายรับ 300 บาท รายจ่าย 45 บาท/ })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "รายจ่าย" }));
  await screen.findByRole("heading", { name: "รายจ่ายแต่ละวัน" });
  expect(screen.getByRole("heading", { name: "แยกตามหมวด" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /รายรับ 300 บาท/ })).toBeNull();
  expect(screen.getByRole("button", { name: /รายจ่าย 45 บาท/ })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "รายรับ" }));
  await screen.findByRole("heading", { name: "รายรับแต่ละวัน" });
  expect(screen.queryByRole("heading", { name: "แยกตามหมวด" })).toBeNull(); // income has no categories
  expect(screen.getByRole("button", { name: /รายรับ 300 บาท/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: "แผนเงิน › รายรับ" }).getAttribute("href")).toBe("/app/plan?tab=list");
});

it("tapping a day shows its income and spending (green plus, grey minus), and future days say so", async () => {
  const api = createMockApi({ consented: true });
  await api.addIncome({ amount: 30000, note: "แม่โอนให้" }, "i-1");
  await api.addEntry({ amount: 4500, category: "food", note: "ข้าว" }, "e-1");
  render(
    <ApiContext.Provider value={api}>
      <ReportsView />
    </ApiContext.Provider>,
  );
  const day = await screen.findByRole("button", { name: /รายรับ 300 บาท รายจ่าย 45 บาท/ });
  fireEvent.click(day);
  const detail = screen.getByRole("status");
  expect(within(detail).getByText("+300 บาท").className).toContain("text-ok");
  expect(within(detail).getByText("−45 บาท")).toBeTruthy();
  const future = screen.getAllByRole("button", { name: /ยังไม่ถึงวันนี้/ })[0];
  fireEvent.click(future);
  expect(within(screen.getByRole("status")).getByText("ยังไม่ถึงวันนี้")).toBeTruthy();
});
