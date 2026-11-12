// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shell/toast";
import { thaiDate } from "@/lib/calc/time";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import { loadPendingRecord, savePendingRecord } from "@/lib/client/pending-record";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

const push = vi.fn();
const replace = vi.fn();
let currentSearch = "";
let currentParams: Record<string, string> = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  useParams: () => currentParams,
}));

import { RecordEditView, RecordLinkView, RecordNewView } from "./record-views";

const mk = () => createMockApi({ scenario: "default", today: thaiDate(new Date()) });
const AMOUNT = "จำนวนเงิน (บาท)";
const NOT_READY_BANNER = "ยังไม่พร้อมใช้งาน — ตอนนี้จดได้เฉพาะรายจ่าย";

function renderWith(api: PorchaiApi, ui: React.ReactElement) {
  return render(
    <ApiContext.Provider value={api}>
      <ToastProvider>{ui}</ToastProvider>
    </ApiContext.Provider>,
  );
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  currentSearch = "";
  currentParams = {};
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe("RecordNewView — income (D1)", () => {
  it("not_implemented: shows the in-form banner, keeps typed data, never claims success", async () => {
    const api = mk();
    const income = vi
      .spyOn(api, "addIncome")
      .mockRejectedValue(new ApiError(501, "not_implemented", "ยังไม่พร้อมใช้งาน"));
    const adjust = vi.spyOn(api, "adjustBalance");
    currentSearch = "type=income";
    renderWith(api, <RecordNewView />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(AMOUNT), "500");
    await user.type(screen.getByLabelText("ชื่อรายการ"), "เงินจากบ้าน");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));

    expect(await screen.findByText(NOT_READY_BANNER)).toBeTruthy();
    expect((screen.getByLabelText(AMOUNT) as HTMLInputElement).value).toBe("500");
    expect((screen.getByLabelText("ชื่อรายการ") as HTMLInputElement).value).toBe("เงินจากบ้าน");
    expect(replace).not.toHaveBeenCalled();
    expect(adjust).not.toHaveBeenCalled();
    expect(income).toHaveBeenCalledTimes(1);
    expect(income.mock.calls[0][0]).toEqual({ amount: 50000, note: "เงินจากบ้าน", receivedOn: thaiDate(new Date()) });
  });

  it("double tap sends addIncome once; a retry of the same data reuses the key; an edited amount gets a new key", async () => {
    const api = mk();
    // fails slowly, so the second tap of the double tap lands while the first is still in flight
    const income = vi.spyOn(api, "addIncome").mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new ApiError(500, "boom", "เซิร์ฟเวอร์ขัดข้อง")), 60)),
    );
    currentSearch = "type=income";
    renderWith(api, <RecordNewView />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(AMOUNT), "500");
    await user.dblClick(screen.getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("เซิร์ฟเวอร์ขัดข้อง")).toBeTruthy();
    expect(income).toHaveBeenCalledTimes(1);

    await waitFor(() => expect((screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(income).toHaveBeenCalledTimes(2));
    expect(income.mock.calls[1][1]).toBe(income.mock.calls[0][1]);

    await waitFor(() => expect((screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(false));
    await user.clear(screen.getByLabelText(AMOUNT));
    await user.type(screen.getByLabelText(AMOUNT), "600");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(income).toHaveBeenCalledTimes(3));
    expect(income.mock.calls[2][1]).not.toBe(income.mock.calls[0][1]);
  });

  it("success goes through addIncome (no client balance math) and stays busy while navigating", async () => {
    const api = mk();
    const income = vi.spyOn(api, "addIncome");
    const adjust = vi.spyOn(api, "adjustBalance");
    currentSearch = "type=income";
    renderWith(api, <RecordNewView />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(AMOUNT), "500");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/record/done?mode=normal"));
    expect(income).toHaveBeenCalledTimes(1);
    expect(adjust).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("RecordNewView — expense (D1)", () => {
  it("defaults the date to Thai today, not a fixed fixture date", () => {
    const api = mk();
    renderWith(api, <RecordNewView />);
    expect((screen.getByLabelText("วันที่") as HTMLInputElement).value).toBe(thaiDate(new Date()));
  });

  it("double tap sends one addEntry with a server-idempotency key, not entry-<timestamp>", async () => {
    const api = mk();
    const add = vi.spyOn(api, "addEntry");
    renderWith(api, <RecordNewView />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(AMOUNT), "45");
    await user.dblClick(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/record/done?mode=normal"));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][1]).not.toMatch(/^entry-/);
    expect(add.mock.calls[0][1].length).toBeGreaterThan(8);
  });

  it("a failed save retries with the same key and a changed amount gets a new key", async () => {
    const api = mk();
    const add = vi.spyOn(api, "addEntry").mockRejectedValue(new ApiError(500, "boom", "เซิร์ฟเวอร์ขัดข้อง"));
    renderWith(api, <RecordNewView />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(AMOUNT), "45");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("เซิร์ฟเวอร์ขัดข้อง")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(add.mock.calls[1][1]).toBe(add.mock.calls[0][1]);
    await waitFor(() => expect((screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(false));
    await user.type(screen.getByLabelText(AMOUNT), "5");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(3));
    expect(add.mock.calls[2][1]).not.toBe(add.mock.calls[0][1]);
  });

  it("with a reserved purchase plan it saves the draft and goes to D2 without calling addEntry", async () => {
    const api = mk();
    await api.addPlan({ title: "รองเท้า", amount: 48000, kind: "purchase", status: "reserved" }, "k1");
    const add = vi.spyOn(api, "addEntry");
    renderWith(api, <RecordNewView />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(AMOUNT), "480");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/record/link"));
    expect(add).not.toHaveBeenCalled();
    expect(loadPendingRecord()?.amount).toBe(48000);
  });
});

describe("RecordLinkView (D2)", () => {
  it("without a pending draft redirects to /app/record/new and shows no made-up item", async () => {
    const api = mk();
    renderWith(api, <RecordLinkView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/record/new"));
    expect(screen.queryByText("รองเท้า")).toBeNull();
    expect(screen.queryByText("480 บาท")).toBeNull();
  });

  it("with a draft shows it, saves once with a key, and clears the draft after success", async () => {
    const api = mk();
    savePendingRecord({ type: "expense", amount: 12550, note: "ข้าวผัด", category: "food", spentOn: thaiDate(new Date()) });
    const add = vi.spyOn(api, "addEntry");
    renderWith(api, <RecordLinkView />);
    expect(await screen.findByText("ข้าวผัด")).toBeTruthy();
    expect(screen.getByText("125.50 บาท")).toBeTruthy();
    const user = userEvent.setup();
    await user.dblClick(await screen.findByRole("button", { name: "บันทึกเป็นรายจ่ายใหม่" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/record/done?mode=unlinked"));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][1]).not.toMatch(/^entry-/);
    expect(loadPendingRecord()).toBeNull();
  });
});

describe("RecordEditView (D4 / D5)", () => {
  async function seededEntryId(api: PorchaiApi) {
    const res = await api.addEntry(
      { amount: 4500, category: "food", note: "ข้าวมันไก่", spentOn: thaiDate(new Date()) },
      "seed-1",
    );
    return res.entry.id;
  }

  it("an unknown id shows ไม่พบรายการนี้ and never falls back to another entry or calls save/delete", async () => {
    const api = mk();
    await seededEntryId(api);
    const edit = vi.spyOn(api, "editEntry");
    const cancel = vi.spyOn(api, "cancelEntry");
    currentParams = { id: "does-not-exist" };
    renderWith(api, <RecordEditView />);
    expect(await screen.findByText("ไม่พบรายการนี้")).toBeTruthy();
    expect(screen.queryByLabelText(AMOUNT)).toBeNull();
    expect(screen.queryByText("ข้าวมันไก่")).toBeNull();
    expect(screen.queryByRole("button", { name: "บันทึกการแก้ไข" })).toBeNull();
    expect(edit).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("a load failure shows an error with ลองใหม่, not 'not found'", async () => {
    const api = mk();
    const id = await seededEntryId(api);
    vi.spyOn(api, "entries").mockRejectedValueOnce(new Error("down"));
    currentParams = { id };
    renderWith(api, <RecordEditView />);
    expect(await screen.findByText("โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง")).toBeTruthy();
    expect(screen.queryByText("ไม่พบรายการนี้")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByDisplayValue("45")).toBeTruthy();
  });

  it("pre-fills the amount with satangToInputString (45.5, not 45.50) and saves once", async () => {
    const api = mk();
    const res = await api.addEntry(
      { amount: 4550, category: "food", note: "กาแฟ", spentOn: thaiDate(new Date()) },
      "seed-2",
    );
    const edit = vi.spyOn(api, "editEntry");
    currentParams = { id: res.entry.id };
    renderWith(api, <RecordEditView />);
    expect(await screen.findByDisplayValue("45.5")).toBeTruthy();
    const user = userEvent.setup();
    await user.dblClick(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/plan?tab=list"));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit.mock.calls[0][1]).toMatchObject({ amount: 4550 });
  });

  it("an entry from a paid plan disables amount/date and only sends the category", async () => {
    const api = mk();
    const { plans } = await api.plans();
    const bill = plans.find((p) => p.kind === "bill" && p.status === "reserved");
    expect(bill).toBeTruthy();
    // a purchase plan paid with a category produces a plan-sourced entry that allows a category change
    const purchase = await api.addPlan({ title: "รองเท้า", amount: 48000, kind: "purchase", status: "reserved" }, "pk");
    await api.planAction(purchase.plan.id, "pay", { category: "supplies" });
    const planEntry = (await api.entries()).entries.find((e) => e.source === "plan");
    expect(planEntry).toBeTruthy();
    const edit = vi.spyOn(api, "editEntry");
    currentParams = { id: planEntry!.id };
    renderWith(api, <RecordEditView />);
    const amount = (await screen.findByLabelText(AMOUNT)) as HTMLInputElement;
    expect(amount.disabled).toBe(true);
    expect((screen.getByLabelText("วันที่") as HTMLInputElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit.mock.calls[0][1]).toEqual({ category: "supplies" });
  });

  it("deleting a plan-sourced entry shows the server's 409 plan_entry message", async () => {
    const api = mk();
    const purchase = await api.addPlan({ title: "รองเท้า", amount: 48000, kind: "purchase", status: "reserved" }, "pk");
    await api.planAction(purchase.plan.id, "pay", { category: "supplies" });
    const planEntry = (await api.entries()).entries.find((e) => e.source === "plan")!;
    currentParams = { id: planEntry.id };
    renderWith(api, <RecordEditView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ลบรายการนี้" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "ยืนยันลบรายการ" }));
    expect(await screen.findByText("รายการนี้มาจากการจ่ายแผน ให้ยกเลิกการจ่ายที่แผนแทน")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("D5: delete asks in a dialog, cancels once on a double tap, then goes back", async () => {
    const api = mk();
    const id = await seededEntryId(api);
    const cancel = vi.spyOn(api, "cancelEntry");
    currentParams = { id };
    renderWith(api, <RecordEditView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ลบรายการนี้" }));
    expect(cancel).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await user.dblClick(within(dialog).getByRole("button", { name: "ยืนยันลบรายการ" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/plan?tab=list"));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
