// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulateResponse, Summary } from "@/lib/api-types";
import type { BudgetResult } from "@/lib/calc/budget";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";
import { formatThaiDate } from "@/lib/format/date";

const push = vi.fn();
const replace = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  useParams: () => ({}),
}));

import {
  BalanceDoneView,
  footnoteOf,
  PaydayInputView,
  PaydayReviewView,
  PlanEditDoneView,
} from "./edit-flow-views";

const mk = () => createMockApi({ scenario: "default" });
const renderWith = (api: PorchaiApi, ui: React.ReactElement) =>
  render(<ApiContext.Provider value={api}>{ui}</ApiContext.Provider>);

const ok = (daily: number, daysLeft = 15, extra: Partial<Extract<BudgetResult, { kind: "ok" }>> = {}): BudgetResult => ({
  kind: "ok",
  usable: 144000,
  dailyBudget: daily,
  todayRemaining: daily,
  daysLeft,
  spare: 1000,
  maxPurchase: 1000,
  essentialShortPerDay: 0,
  ...extra,
});

const sim = (over: Partial<SimulateResponse>): SimulateResponse => ({
  basis: "basis-1",
  verdict: "ok",
  needs: [],
  before: ok(12000, 12),
  after: ok(9600),
  overLimitBy: 0,
  countsThisCycle: true,
  checks: null,
  ...over,
});

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  currentSearch = "";
});
afterEach(cleanup);

describe("PaydayInputView (E1a)", () => {
  it("shows the current payday and the days left from the summary", async () => {
    renderWith(mk(), <PaydayInputView />);
    expect(await screen.findByText("วันเงินเข้าตอนนี้:")).toBeTruthy();
    expect(screen.getByText(formatThaiDate("2026-11-23", "long"))).toBeTruthy();
    expect(screen.getByText("ถัดไปอีก 12 วัน (รวมวันนี้)")).toBeTruthy();
    expect(screen.getByLabelText("วันเงินเข้าใหม่")).toBeTruthy();
    expect(screen.queryByText(/ยังไม่พร้อมใช้งาน/)).toBeNull();
    expect(screen.queryByText(/−50/)).toBeNull();
  });

  it("omits the days line when the budget is not ok", async () => {
    const api = mk();
    const real = await api.summary();
    vi.spyOn(api, "summary").mockResolvedValue({ ...real, budget: { kind: "payday-passed", usable: 0 } });
    renderWith(api, <PaydayInputView />);
    await screen.findByText("วันเงินเข้าตอนนี้:");
    expect(screen.queryByText(/ถัดไปอีก/)).toBeNull();
  });

  it("N days -> the date today + N, shown under the field; goes to E2 with ?payday", async () => {
    renderWith(mk(), <PaydayInputView />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("วันเงินเข้าใหม่"), "15");
    expect(screen.getByText(`ตรงกับวันที่ ${formatThaiDate("2026-11-26", "long")}`)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ดูสรุปแผนใหม่" }));
    expect(push).toHaveBeenCalledWith("/app/plan/edit/review?payday=2026-11-26");
  });

  it.each(["", "0", "abc", "1.5", "-3", "367", "1000"])("invalid days %j: Thai error, no navigation", async (text) => {
    renderWith(mk(), <PaydayInputView />);
    const user = userEvent.setup();
    const field = await screen.findByLabelText("วันเงินเข้าใหม่");
    if (text) await user.type(field, text);
    await user.click(screen.getByRole("button", { name: "ดูสรุปแผนใหม่" }));
    expect(screen.getByText("ใส่จำนวนวันเป็นเลขจำนวนเต็ม 1–366")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("load failure: alert + ลองใหม่", async () => {
    const api = mk();
    vi.spyOn(api, "summary").mockRejectedValueOnce(new ApiError(500, "internal", "ระบบผิดพลาด"));
    renderWith(api, <PaydayInputView />);
    expect((await screen.findByRole("alert")).textContent).toContain("ระบบผิดพลาด");
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByLabelText("วันเงินเข้าใหม่")).toBeTruthy();
  });
});

describe("PaydayReviewView (E2)", () => {
  beforeEach(() => {
    currentSearch = "payday=2026-11-26";
  });

  it("calls simulate({payday}) fresh and renders the server's before/after only", async () => {
    const api = mk();
    const simulate = vi.spyOn(api, "simulate");
    renderWith(api, <PaydayReviewView />);
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(await screen.findByText("ก่อน")).toBeTruthy();
    expect(simulate).toHaveBeenCalledWith({ payday: "2026-11-26" });
    expect(screen.getByText("หลัง")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("96")).toBeTruthy();
    expect(screen.getAllByText("บาท/วัน")).toHaveLength(2);
    expect(screen.getByText("ดูตัวเลขก่อนและหลังด้านบน แล้วกดยืนยันถ้าถูกต้อง")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ยืนยันแผนใหม่" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ยกเลิก" })).toBeTruthy();
  });

  it("essentials_short: warn banner from overLimitBy / essentialShortPerDay", async () => {
    const api = mk();
    vi.spyOn(api, "simulate").mockResolvedValue(
      sim({
        verdict: "essentials_short",
        after: ok(6150, 12, { spare: -9000, essentialShortPerDay: 850 }),
        overLimitBy: 9000,
      }),
    );
    renderWith(api, <PaydayReviewView />);
    const banner = await screen.findByText(/เงินไม่พอค่าจำเป็นตลอดรอบ/);
    expect(banner.textContent).toContain("ขาดรวม 90 บาท");
    expect(banner.textContent).toContain("วันละ 8.50 บาท");
    expect(screen.getByText("61.50")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ยืนยันแผนใหม่" })).toBeTruthy();
  });

  it("shortfall: error banner with the server's after.shortfall", async () => {
    const api = mk();
    vi.spyOn(api, "simulate").mockResolvedValue(
      sim({
        verdict: "shortfall",
        after: { kind: "shortfall", usable: -5000, shortfall: 5000, daysLeft: 15 },
        overLimitBy: null,
      }),
    );
    renderWith(api, <PaydayReviewView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ขาดอีก 50 บาท");
    expect(screen.getByText("ขาดอีก 50 บาท")).toBeTruthy();
  });

  it("ask/essentials: single field, sent as essentials on the next simulate (not saved)", async () => {
    const api = mk();
    const real = await api.simulate({ payday: "2026-11-26" });
    const simulate = vi
      .spyOn(api, "simulate")
      .mockResolvedValueOnce(sim({ verdict: "ask", needs: ["essentials"], before: null, after: null, overLimitBy: null }))
      .mockResolvedValue(real);
    const setEssentials = vi.spyOn(api, "setEssentials");
    renderWith(api, <PaydayReviewView />);
    const field = await screen.findByLabelText("ค่าจำเป็นต่อวัน (บาท)");
    expect(screen.queryByRole("button", { name: "ยืนยันแผนใหม่" })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "ลองคำนวณอีกครั้ง" }));
    expect(screen.getByText(/ใส่ค่าจำเป็นต่อวันก่อน/)).toBeTruthy();
    await user.type(field, "70");
    await user.click(screen.getByRole("button", { name: "ลองคำนวณอีกครั้ง" }));
    await waitFor(() => expect(simulate).toHaveBeenCalledTimes(2));
    expect(simulate).toHaveBeenLastCalledWith({ payday: "2026-11-26", essentials: { food: 7000, transport: 0 } });
    expect(setEssentials).not.toHaveBeenCalled();
    expect(await screen.findByText("ก่อน")).toBeTruthy();
  });

  it("confirm: changePayday once with the simulate's basis (double tap = one call), then E3", async () => {
    const api = mk();
    const expected = await api.simulate({ payday: "2026-11-26" });
    const change = vi.spyOn(api, "changePayday");
    renderWith(api, <PaydayReviewView />);
    const confirm = await screen.findByRole("button", { name: "ยืนยันแผนใหม่" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/plan/edit/done"));
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith({ payday: "2026-11-26", basis: expected.basis });
    expect((await api.summary()).payday).toBe("2026-11-26");
  });

  it("stale: Thai message, re-simulates, shows the new result, and confirm uses the NEW basis", async () => {
    const api = mk();
    const change = vi.spyOn(api, "changePayday");
    const simulate = vi.spyOn(api, "simulate");
    renderWith(api, <PaydayReviewView />);
    const confirm = await screen.findByRole("button", { name: "ยืนยันแผนใหม่" });
    const oldBasis = (await simulate.mock.results[0].value).basis as string;
    // the numbers change elsewhere before the user confirms
    await api.addEntry({ amount: 4500, category: "food" }, "elsewhere");
    const fresh = await api.summary();
    expect(fresh.basis).not.toBe(oldBasis);

    const user = userEvent.setup();
    await user.click(confirm);
    expect(await screen.findByText("ข้อมูลเปลี่ยนไปแล้ว ลองดูผลใหม่อีกครั้ง")).toBeTruthy();
    await waitFor(() => expect(simulate).toHaveBeenCalledTimes(2));
    expect(change.mock.calls[0][0]).toEqual({ payday: "2026-11-26", basis: oldBasis });
    expect(replace).not.toHaveBeenCalled();

    // new result shown, buttons enabled for it
    const again = (await screen.findByRole("button", { name: "ยืนยันแผนใหม่" })) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    await user.click(again);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/plan/edit/done"));
    expect(change).toHaveBeenCalledTimes(2);
    expect(change.mock.calls[1][0]).toEqual({ payday: "2026-11-26", basis: fresh.basis });
  });

  it("other server error: Thai message in an alert, the button is usable again", async () => {
    const api = mk();
    vi.spyOn(api, "changePayday").mockRejectedValue(new ApiError(500, "internal", "ระบบผิดพลาด"));
    renderWith(api, <PaydayReviewView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ยืนยันแผนใหม่" }));
    expect((await screen.findByRole("alert")).textContent).toContain("ระบบผิดพลาด");
    expect((screen.getByRole("button", { name: "ยืนยันแผนใหม่" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("cancel goes back to /app and calls nothing that changes data", async () => {
    const api = mk();
    const change = vi.spyOn(api, "changePayday");
    renderWith(api, <PaydayReviewView />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "ยกเลิก" }));
    expect(push).toHaveBeenCalledWith("/app");
    expect(change).not.toHaveBeenCalled();
    expect((await api.summary()).payday).toBe("2026-11-23");
  });

  it("failure: error banner + ลองใหม่; a missing or bad ?payday goes back to E1a", async () => {
    const api = mk();
    vi.spyOn(api, "simulate").mockRejectedValueOnce(new ApiError(500, "internal", "คำนวณไม่ได้"));
    const first = renderWith(api, <PaydayReviewView />);
    expect((await screen.findByRole("alert")).textContent).toContain("คำนวณไม่ได้");
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("ก่อน")).toBeTruthy();
    first.unmount();

    currentSearch = "payday=2026-02-31";
    renderWith(mk(), <PaydayReviewView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/plan/edit/payday"));
  });
});

describe("E3 / E5 done views", () => {
  it("E3: server numbers + footnote composed from the summary values; link back to the dashboard", async () => {
    renderWith(mk(), <PlanEditDoneView />);
    expect(await screen.findByText("ใช้ได้วันละ")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "อัปเดตแล้ว" })).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("บาท/วัน")).toBeTruthy();
    expect(screen.getByText("(2,400 − 600 − 240 − 120) ÷ 12 วัน")).toBeTruthy();
    expect(screen.getByRole("link", { name: "กลับ Dashboard" }).getAttribute("href")).toBe("/app");
    expect(screen.queryByRole("link", { name: "ย้อนกลับ" })).toBeNull();
  });

  it("E5 uses its own header", async () => {
    renderWith(mk(), <BalanceDoneView />);
    expect(await screen.findByRole("heading", { name: "ปรับยอดแล้ว" })).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
  });

  it("footnote is omitted when a value is missing (or today's spending is not 0)", async () => {
    const real: Summary = await mk().summary();
    expect(footnoteOf(real)).toBe("(2,400 − 600 − 240 − 120) ÷ 12 วัน");
    expect(footnoteOf({ ...real, emergencyBuffer: undefined } as unknown as Summary)).toBeNull();
    expect(footnoteOf({ ...real, reserved: undefined } as unknown as Summary)).toBeNull();
    expect(footnoteOf({ ...real, budget: { kind: "payday-passed", usable: 0 } })).toBeNull();
    expect(footnoteOf({ ...real, spentToday: 4500 })).toBeNull();
    // 0 is a real value, not missing
    expect(footnoteOf({ ...real, emergencyBuffer: 0 })).toContain("− 0)");

    const api = mk();
    vi.spyOn(api, "summary").mockResolvedValue({ ...real, savings: undefined } as unknown as Summary);
    renderWith(api, <PlanEditDoneView />);
    expect(await screen.findByText("120")).toBeTruthy();
    expect(screen.queryByText(/÷/)).toBeNull();
  });

  it("load failure: alert + ลองใหม่", async () => {
    const api = mk();
    vi.spyOn(api, "summary").mockRejectedValueOnce(new ApiError(500, "internal", "โหลดไม่ได้"));
    renderWith(api, <PlanEditDoneView />);
    expect((await screen.findByRole("alert")).textContent).toContain("โหลดไม่ได้");
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("ใช้ได้วันละ")).toBeTruthy();
  });
});
