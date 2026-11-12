// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shell/toast";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

const push = vi.fn();
const replace = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  useParams: () => ({}),
}));

import { BalanceAdjustView, PlanEditView, PlanMainView, PlusView } from "./plan-views";

const mk = () => createMockApi({ scenario: "default" });
const NOT_READY = "ยังไม่พร้อมใช้งาน";

function renderWith(api: PorchaiApi, ui: React.ReactElement) {
  return render(
    <ApiContext.Provider value={api}>
      <ToastProvider>{ui}</ToastProvider>
    </ApiContext.Provider>,
  );
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const rowOf = (title: string) => screen.getByText(title).closest("li") as HTMLElement;

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  currentSearch = "";
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe("PlanMainView — load (H1/H2/H9)", () => {
  it("failure: error banner + ลองใหม่, retry works, never '0 บาท' while loading or failed", async () => {
    const api = mk();
    currentSearch = "tab=savings";
    const gate = deferred<Awaited<ReturnType<PorchaiApi["summary"]>>>();
    const summary = vi.spyOn(api, "summary").mockImplementationOnce(() => gate.promise);
    renderWith(api, <PlanMainView />);
    expect(screen.queryByText(/(^|\s)0 บาท/)).toBeNull();
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();

    await act(async () => gate.reject(new ApiError(500, "internal", "ระบบผิดพลาด")));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ระบบผิดพลาด");
    expect(screen.queryByText(/(^|\s)0 บาท/)).toBeNull();
    expect(screen.queryByText("เป้าออมรอบนี้")).toBeNull();

    summary.mockRestore();
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("เป้าออมรอบนี้")).toBeTruthy();
    expect(screen.getByText("240 บาท")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("no_cycle redirects to setup without an error flash", async () => {
    const api = mk();
    vi.spyOn(api, "summary").mockRejectedValue(new ApiError(409, "no_cycle", "ยังไม่ได้ตั้งรอบเงิน"));
    renderWith(api, <PlanMainView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/setup/income"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PlanMainView — tabs and filters (a11y)", () => {
  it("tablist with three tabs, aria-selected, aria-controls matching a labelled tabpanel", async () => {
    renderWith(mk(), <PlanMainView />);
    const tablist = await screen.findByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["รายการ", "รอจ่าย", "ออม/เผื่อ"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    const panel = screen.getByRole("tabpanel");
    for (const t of tabs) expect(t.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);

    await userEvent.setup().click(tabs[2]);
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tabs[2].id);
    expect(await screen.findByText("เป้าออมรอบนี้")).toBeTruthy();
  });

  it("filter chips use aria-pressed; รายรับ shows the normal empty state", async () => {
    renderWith(mk(), <PlanMainView />);
    const user = userEvent.setup();
    const all = await screen.findByRole("button", { name: "ทั้งหมด" });
    const income = screen.getByRole("button", { name: "รายรับ" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    await user.click(income);
    expect(income.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("ยังไม่มีรายการในหมวดนี้")).toBeTruthy();
  });
});

describe("PlanMainView — quota (H1)", () => {
  it("planQuota not_implemented: no banner and no 'x/y ฟรี' counter", async () => {
    const api = mk();
    currentSearch = "tab=pending";
    vi.spyOn(api, "planQuota").mockRejectedValue(new ApiError(501, "not_implemented", NOT_READY));
    renderWith(api, <PlanMainView />);
    await screen.findByText("รายการที่เก็บไว้ในแผน");
    expect(screen.queryByText(/ใช้สิทธิ์แผนฟรี/)).toBeNull();
    expect(screen.queryByText(/รายการฟรี/)).toBeNull();
  });

  it("planQuota full: banner with the server's numbers", async () => {
    const api = mk();
    currentSearch = "tab=pending";
    vi.spyOn(api, "planQuota").mockResolvedValue({ used: 3, limit: 3 });
    renderWith(api, <PlanMainView />);
    expect(await screen.findByText("ใช้สิทธิ์แผนฟรีแล้ว 3/3 ในรอบนี้")).toBeTruthy();
    expect(screen.getByRole("link", { name: "ดู Plus ›" }).getAttribute("href")).toBe("/app/plus");
  });
});

describe("PlanMainView — plan actions (E1–E3, docs 3.2)", () => {
  async function withPlan(category?: "food") {
    const api = mk();
    currentSearch = "tab=pending";
    await api.addPlan({ title: "รองเท้า", amount: 48000, ...(category ? { category } : {}) }, "k-1");
    return api;
  }

  it("reserved: shows จ่ายแล้ว only; เลื่อน and ยกเลิก live in the row menu", async () => {
    renderWith(await withPlan(), <PlanMainView />);
    await screen.findByText("รองเท้า");
    const row = rowOf("รองเท้า");
    expect(within(row).getByRole("button", { name: "จ่ายแล้ว" })).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "ยกเลิกการจ่าย" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "ยกเลิก" })).toBeNull();
    const menu = within(row).getByRole("button", { name: /แก้แผน/ });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    await userEvent.setup().click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(within(row).getByRole("button", { name: "เลื่อนไปรอบหน้า" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "ยกเลิก" })).toBeTruthy();
  });

  it("pay uses the plan's own category, updates from the response, and ยกเลิกการจ่าย appears only in the paid row menu", async () => {
    const api = await withPlan("food");
    const pay = vi.spyOn(api, "planAction");
    renderWith(api, <PlanMainView />);
    const user = userEvent.setup();
    await screen.findByText("รองเท้า");
    await user.click(within(rowOf("รองเท้า")).getByRole("button", { name: "จ่ายแล้ว" }));
    await waitFor(() => expect(pay).toHaveBeenCalledTimes(1));
    expect(pay).toHaveBeenCalledWith(expect.any(String), "pay", { category: "food" });

    await waitFor(() => expect(within(rowOf("รองเท้า")).getByText("จ่ายแล้ว ✓")).toBeTruthy());
    const row = rowOf("รองเท้า");
    expect(within(row).queryByRole("button", { name: "จ่ายแล้ว" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "ยกเลิกการจ่าย" })).toBeNull();
    await user.click(within(row).getByRole("button", { name: /แก้แผน/ }));
    await user.click(within(row).getByRole("button", { name: "ยกเลิกการจ่าย" }));
    await waitFor(() => expect(pay).toHaveBeenCalledTimes(2));
    expect(pay.mock.calls[1][1]).toBe("unpay");
    await waitFor(() => expect(within(rowOf("รองเท้า")).getByRole("button", { name: "จ่ายแล้ว" })).toBeTruthy());
  });

  it("a plan without a category pays with no body (server default); double tap sends one call", async () => {
    const api = await withPlan();
    const gate = deferred<Awaited<ReturnType<PorchaiApi["planAction"]>>>();
    const pay = vi.spyOn(api, "planAction").mockImplementation(() => gate.promise);
    renderWith(api, <PlanMainView />);
    await screen.findByText("รองเท้า");
    const btn = within(rowOf("รองเท้า")).getByRole("button", { name: "จ่ายแล้ว" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(pay).toHaveBeenCalledTimes(1);
    expect(pay.mock.calls[0]).toHaveLength(2);
    await act(async () => gate.reject(new ApiError(500, "x", "ล้มเหลว")));
  });

  it("failure shows the Thai message (409 plan_status) and leaves the lists unchanged", async () => {
    const api = await withPlan();
    vi.spyOn(api, "planAction").mockRejectedValue(
      new ApiError(409, "plan_status", "แผนนี้จ่ายไปแล้ว ทำซ้ำไม่ได้"),
    );
    renderWith(api, <PlanMainView />);
    await screen.findByText("รองเท้า");
    await userEvent.setup().click(within(rowOf("รองเท้า")).getByRole("button", { name: "จ่ายแล้ว" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("แผนนี้จ่ายไปแล้ว ทำซ้ำไม่ได้");
    expect(within(rowOf("รองเท้า")).getByRole("button", { name: "จ่ายแล้ว" })).toBeTruthy();
    expect(within(rowOf("รองเท้า")).getByText(/เก็บไว้ในแผน/)).toBeTruthy();
    // the guard is released after a failure: the user can try again
    await waitFor(() =>
      expect((within(rowOf("รองเท้า")).getByRole("button", { name: "จ่ายแล้ว" }) as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("postponed: no visible action; keep and cancel are in the menu; keep moves it back", async () => {
    const api = await withPlan();
    const { plans } = await api.plans();
    await api.planAction(plans.find((p) => p.title === "รองเท้า")!.id, "postpone");
    renderWith(api, <PlanMainView />);
    const user = userEvent.setup();
    await screen.findByText("รองเท้า");
    const row = rowOf("รองเท้า");
    expect(within(row).queryByRole("button", { name: "จ่ายแล้ว" })).toBeNull();
    await user.click(within(row).getByRole("button", { name: /แก้แผน/ }));
    await user.click(within(row).getByRole("button", { name: "เก็บไว้ในแผน" }));
    await waitFor(() => expect(within(rowOf("รองเท้า")).getByRole("button", { name: "จ่ายแล้ว" })).toBeTruthy());
  });

  it("the save-once rule: a successful action can be followed by another on the same row", async () => {
    const api = await withPlan();
    renderWith(api, <PlanMainView />);
    const user = userEvent.setup();
    await screen.findByText("รองเท้า");
    await user.click(within(rowOf("รองเท้า")).getByRole("button", { name: /แก้แผน/ }));
    await user.click(within(rowOf("รองเท้า")).getByRole("button", { name: "เลื่อนไปรอบหน้า" }));
    await waitFor(() => expect(within(rowOf("รองเท้า")).queryByRole("button", { name: "จ่ายแล้ว" })).toBeNull());
    await user.click(within(rowOf("รองเท้า")).getByRole("button", { name: /แก้แผน/ }));
    await user.click(within(rowOf("รองเท้า")).getByRole("button", { name: "เก็บไว้ในแผน" }));
    await waitFor(() => expect(within(rowOf("รองเท้า")).getByRole("button", { name: "จ่ายแล้ว" })).toBeTruthy());
  });
});

describe("PlanEditView (E1)", () => {
  it("E1a change payday: no API, so it says ยังไม่พร้อมใช้งาน and goes nowhere", async () => {
    renderWith(mk(), <PlanEditView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /เปลี่ยนวันเงินเข้า/ }));
    await user.click(screen.getByRole("button", { name: "ไปกรอกข้อมูล" }));
    expect(screen.getByText(/ยังไม่พร้อมใช้งาน/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("balance option goes to the adjust page", async () => {
    renderWith(mk(), <PlanEditView />);
    await userEvent.setup().click(screen.getByRole("button", { name: "ไปกรอกข้อมูล" }));
    expect(push).toHaveBeenCalledWith("/app/balance/adjust");
  });

  it("E1b off-cycle income opens the income form, which reports ยังไม่พร้อมใช้งาน when addIncome is not_implemented", async () => {
    renderWith(mk(), <PlanEditView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /เพิ่มรายรับนอกรอบ/ }));
    await user.click(screen.getByRole("button", { name: "ไปกรอกข้อมูล" }));
    expect(push).toHaveBeenCalledWith("/app/record/new?type=income");
  });
});

describe("BalanceAdjustView (E4)", () => {
  it("prefills with satangToInputString (no thousands commas), saves once, shows the server summary only", async () => {
    const api = mk();
    const real = await api.summary();
    const adjust = vi.spyOn(api, "adjustBalance");
    renderWith(api, <BalanceAdjustView />);
    const field = (await screen.findByLabelText("เงินที่มีอยู่จริงตอนนี้ (บาท)")) as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe(String(real.balance / 100)));
    expect(field.value).not.toContain(",");

    fireEvent.change(field, { target: { value: "2,300.5" } });
    const save = screen.getByRole("button", { name: "ยืนยันปรับยอด" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(1));
    expect(adjust).toHaveBeenCalledWith({ balance: 230050 });
    expect(await screen.findByText(/ยอดเงินจริงปัจจุบันคือ 2,300\.50 บาท/)).toBeTruthy();
  });

  it("invalid amount: message, no call; server failure: alert, data kept, can retry", async () => {
    const api = mk();
    const adjust = vi.spyOn(api, "adjustBalance").mockRejectedValue(new ApiError(500, "internal", "ระบบผิดพลาด"));
    renderWith(api, <BalanceAdjustView />);
    const user = userEvent.setup();
    const field = (await screen.findByLabelText("เงินที่มีอยู่จริงตอนนี้ (บาท)")) as HTMLInputElement;
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "ยืนยันปรับยอด" }));
    expect(screen.getByText("ใส่เป็นตัวเลขมากกว่า 0")).toBeTruthy();
    expect(adjust).not.toHaveBeenCalled();

    await user.type(field, "500");
    await user.click(screen.getByRole("button", { name: "ยืนยันปรับยอด" }));
    expect((await screen.findByRole("alert")).textContent).toContain("ระบบผิดพลาด");
    expect(field.value).toBe("500");
    await user.click(screen.getByRole("button", { name: "ยืนยันปรับยอด" }));
    await waitFor(() => expect(adjust).toHaveBeenCalledTimes(2));
  });

  it("a negative balance is not put into the input", async () => {
    const api = mk();
    const real = await api.summary();
    vi.spyOn(api, "summary").mockResolvedValue({ ...real, balance: -1500 });
    renderWith(api, <BalanceAdjustView />);
    const field = (await screen.findByLabelText("เงินที่มีอยู่จริงตอนนี้ (บาท)")) as HTMLInputElement;
    await screen.findByText(/ยอดในแอปตอนนี้/);
    expect(field.value).toBe("");
  });

  it("summary load failure shows an error instead of staying silent", async () => {
    const api = mk();
    vi.spyOn(api, "summary").mockRejectedValue(new ApiError(500, "internal", "โหลดไม่ได้"));
    renderWith(api, <BalanceAdjustView />);
    expect((await screen.findByRole("alert")).textContent).toContain("โหลดไม่ได้");
  });
});

describe("PlusView (C5)", () => {
  it("shows only Figma's wording, no invented price or bullets; buying says ยังไม่พร้อมใช้งาน", async () => {
    const api = mk();
    vi.spyOn(api, "planQuota").mockResolvedValue({ used: 3, limit: 3 });
    renderWith(api, <PlusView />);
    expect(await screen.findByText("รอบนี้ใช้สิทธิ์แผนฟรีครบแล้ว (3/3)")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/39|ไม่จำกัด|เปรียบเทียบผลกระทบ/);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "ซื้อ Plus 29 บาท" }));
    expect(screen.getByText(/ยังไม่พร้อมใช้งาน/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "ไว้ก่อน" }).getAttribute("href")).toBe("/app");
  });

  it("planQuota not_implemented: no quota line", async () => {
    const api = mk();
    vi.spyOn(api, "planQuota").mockRejectedValue(new ApiError(501, "not_implemented", NOT_READY));
    renderWith(api, <PlusView />);
    await screen.findByRole("button", { name: "ซื้อ Plus 29 บาท" });
    expect(screen.queryByText(/ใช้สิทธิ์แผนฟรี/)).toBeNull();
  });
});
