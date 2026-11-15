// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
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
