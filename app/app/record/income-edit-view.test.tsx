// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

const replace = vi.fn();
let id = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useParams: () => ({ id }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/shell/toast", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

import { IncomeEditView } from "./income-edit-view";

afterEach(() => {
  cleanup();
  replace.mockClear();
});

async function setup(over: Partial<PorchaiApi> = {}) {
  const base = createMockApi({ scenario: "default" });
  await base.addIncome({ amount: 30000, note: "ค่าขนม" }, "k1");
  id = (await base.incomes()).incomes[0].id;
  const api = { ...base, ...over } as PorchaiApi;
  render(
    <ApiContext.Provider value={api}>
      <IncomeEditView />
    </ApiContext.Provider>,
  );
  return { base, api };
}

describe("IncomeEditView", () => {
  it("shows the income and saves a new amount through editIncome", async () => {
    const { base } = await setup();
    const user = userEvent.setup();
    const field = await screen.findByLabelText("จำนวนเงิน (บาท)");
    expect((field as HTMLInputElement).value).toBe("300");
    await user.clear(field);
    await user.type(field, "450");
    await user.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/app/plan?tab=list"),
    );
    expect((await base.incomes()).incomes[0].amount).toBe(45000);
  });

  it("deleting asks first, then cancels the income", async () => {
    const { base } = await setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ลบรายรับนี้" }));
    expect(
      screen.getByRole("dialog", { name: "ยืนยันลบรายรับนี้ไหม" }),
    ).toBeTruthy();
    expect((await base.incomes()).incomes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "ยืนยันลบรายรับ" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/app/plan?tab=list"),
    );
    expect((await base.incomes()).incomes).toHaveLength(0);
  });

  it("an amount of 0 or a word is not sent", async () => {
    const editIncome = vi.fn();
    await setup({ editIncome });
    const user = userEvent.setup();
    const field = await screen.findByLabelText("จำนวนเงิน (บาท)");
    await user.clear(field);
    await user.type(field, "abc");
    await user.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    expect(editIncome).not.toHaveBeenCalled();
    expect(screen.getByText("ใส่เป็นตัวเลขมากกว่า 0")).toBeTruthy();
  });

  it("when the backend has no such endpoint it says ยังไม่พร้อมใช้งาน and stays on the page", async () => {
    const notReady = () =>
      Promise.reject(
        new ApiError(501, "not_implemented", "ฟีเจอร์นี้ยังไม่พร้อมใช้งาน"),
      );
    await setup({ editIncome: notReady, cancelIncome: notReady });
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText("จำนวนเงิน (บาท)"), {
      target: { value: "500" },
    });
    await user.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    expect((await screen.findByText(/ยังไม่พร้อมใช้งาน/)).textContent).toContain(
      "ข้อมูลของคุณยังเหมือนเดิม",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("an unknown id is not found, never some other income", async () => {
    const base = createMockApi({ scenario: "default" });
    id = "nope";
    render(
      <ApiContext.Provider value={base}>
        <IncomeEditView />
      </ApiContext.Provider>,
    );
    expect(await screen.findByText("ไม่พบรายการนี้")).toBeTruthy();
  });
});
