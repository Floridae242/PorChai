// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

import { CategoriesSummaryView } from "./categories-view";

function renderWith(api: PorchaiApi) {
  return render(
    <ApiContext.Provider value={api}>
      <CategoriesSummaryView />
    </ApiContext.Provider>,
  );
}

beforeEach(() => replace.mockClear());
afterEach(cleanup);

describe("CategoriesSummaryView (G1)", () => {
  it("success renders one row per category with server amounts via formatBaht", async () => {
    const api = createMockApi({ scenario: "default" });
    vi.spyOn(api, "categoryTotals").mockResolvedValue({
      items: [
        { category: "food", amount: 123450, count: 3 },
        { category: "travel", amount: 3000, count: 1 },
      ],
    } as never);
    renderWith(api);
    expect(await screen.findByText("1,234.50 บาท")).toBeTruthy();
    expect(screen.getByText("30 บาท")).toBeTruthy();
    expect(screen.getByText("3 รายการในรอบนี้")).toBeTruthy();
  });

  it("not_implemented shows ยังไม่พร้อมใช้งาน and no numbers", async () => {
    const api = createMockApi({ scenario: "default" });
    vi.spyOn(api, "categoryTotals").mockRejectedValue(new ApiError(501, "not_implemented", "x"));
    renderWith(api);
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    expect(screen.queryByText(/บาท$/)).toBeNull();
  });

  it("failure shows an error and ลองใหม่ reloads", async () => {
    const api = createMockApi({ scenario: "default" });
    const spy = vi
      .spyOn(api, "categoryTotals")
      .mockRejectedValueOnce(new ApiError(500, "internal", "x"))
      .mockResolvedValue({ items: [{ category: "food", amount: 4500, count: 1 }] } as never);
    renderWith(api);
    expect(await screen.findByText("โหลดสรุปหมวดไม่สำเร็จ ลองใหม่อีกครั้ง")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("45 บาท")).toBeTruthy();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
