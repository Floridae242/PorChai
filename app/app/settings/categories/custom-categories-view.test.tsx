// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";
import { CustomCategoriesView } from "./custom-categories-view";
import { ApiError } from "@/lib/client/errors";
import type { SpendingCategory } from "@/lib/insights/types";
afterEach(cleanup);
async function reviewNewCategory() {
  fireEvent.click(await screen.findByRole("button", { name: "+ สร้างหมวดใหม่" }));
  fireEvent.change(screen.getByLabelText("ชื่อหมวด"), {
    target: { value: "ชานม" },
  });
  fireEvent.change(screen.getByLabelText("งบต่อเดือน (บาท)"), {
    target: { value: "0" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ตรวจข้อมูลก่อนบันทึก" }));
}
it("double-clicking confirmation while a save is pending sends one request", async () => {
  const api = createMockApi(),
    original = api.saveSpendingCategory;
  let resolve!: (value: SpendingCategory) => void;
  const pending = new Promise<SpendingCategory>((r) => {
    resolve = r;
  });
  const save = vi.spyOn(api, "saveSpendingCategory").mockReturnValue(pending);
  render(
    <ApiContext.Provider value={api}>
      <CustomCategoriesView />
    </ApiContext.Provider>,
  );
  await reviewNewCategory();
  const button = screen.getByRole("button", { name: "ยืนยันบันทึกหมวดและงบ" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(save).toHaveBeenCalledTimes(1);
  resolve(await original({ label: "ชานม", parent: "food", monthlyBudget: 0 }));
  await screen.findByText("บันทึกหมวดและงบแล้ว");
});
it("closing a preview and cancelling the draft never saves even a zero budget", async () => {
  const api = createMockApi(),
    save = vi.spyOn(api, "saveSpendingCategory");
  render(
    <ApiContext.Provider value={api}>
      <CustomCategoriesView />
    </ApiContext.Provider>,
  );
  await reviewNewCategory();
  fireEvent.click(screen.getByRole("button", { name: "กลับไปแก้ไข" }));
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิกแก้ไข" }));
  expect(save).not.toHaveBeenCalled();
  expect((await api.spendingCategories()).some((x) => x.label === "ชานม")).toBe(
    false,
  );
});
it("stale save failure does not claim success or erase typed data", async () => {
  const api = createMockApi();
  vi.spyOn(api, "saveSpendingCategory").mockRejectedValue(
    new ApiError(409, "stale", "stale"),
  );
  render(
    <ApiContext.Provider value={api}>
      <CustomCategoriesView />
    </ApiContext.Provider>,
  );
  await reviewNewCategory();
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันบันทึกหมวดและงบ" }));
  await screen.findByText("ข้อมูลหมวดเปลี่ยนแล้ว กรุณาโหลดล่าสุดและตรวจอีกครั้งก่อนบันทึก");
  expect((screen.getByLabelText("ชื่อหมวด") as HTMLInputElement).value).toBe(
    "ชานม",
  );
  expect(
    (screen.getByLabelText("งบต่อเดือน (บาท)") as HTMLInputElement).value,
  ).toBe("0");
  expect(screen.queryByText("บันทึกหมวดและงบแล้ว")).toBeNull();
});
it("creating a personal category requires review and explicit confirmation", async () => {
  const api = createMockApi(),
    save = vi.spyOn(api, "saveSpendingCategory");
  render(
    <ApiContext.Provider value={api}>
      <CustomCategoriesView />
    </ApiContext.Provider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "+ สร้างหมวดใหม่" }));
  fireEvent.change(screen.getByLabelText("ชื่อหมวด"), {
    target: { value: "ชานม" },
  });
  fireEvent.change(screen.getByLabelText("งบต่อเดือน (บาท)"), {
    target: { value: "500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "ตรวจข้อมูลก่อนบันทึก" }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันบันทึกหมวดและงบ" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ label: "ชานม", monthlyBudget: 50000 }),
    ),
  );
  await screen.findByText("บันทึกหมวดและงบแล้ว");
});
it("suggestions cannot silently change budget settings", async () => {
  const api = createMockApi();
  await api.addEntry({ amount: 5000, category: "food", note: "ข้าว" }, "a");
  const save = vi.spyOn(api, "saveSpendingCategory");
  render(
    <ApiContext.Provider value={api}>
      <CustomCategoriesView />
    </ApiContext.Provider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "ดูงบแนะนำจากประวัติ" }),
  );
  await screen.findByText("งบแนะนำเป็นเพียงร่าง");
  expect(save).not.toHaveBeenCalled();
});
