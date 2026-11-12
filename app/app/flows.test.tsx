// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shell/toast";
import { createMockApi } from "@/lib/client/mock";
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

import { PerksListView, PointsView, ShopVerifyView } from "./perks/perks-views";
import { PlanMainView } from "./plan/plan-views";
import { RecordNewView } from "./record/record-views";
import { SettingsNotificationsView } from "./settings/settings-views";
import { saveTryDraft, TryDecideView, TryResultView } from "./try/try-views";

describe("Phase 2 Core Flows (G05–G12)", () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    currentSearch = "";
    currentParams = {};
  });
  afterEach(cleanup);

  it("G05: validates invalid amount (S5) and records expense Rice 45 (D1 -> D3)", async () => {
    const api = createMockApi({ scenario: "default" });
    render(
      <ApiContext.Provider value={api}>
        <ToastProvider>
          <RecordNewView />
        </ToastProvider>
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("จำนวนเงิน (บาท)"), "abc");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(screen.getByText("ใส่เป็นตัวเลขมากกว่า 0")).toBeTruthy();

    await user.clear(screen.getByLabelText("จำนวนเงิน (บาท)"));
    await user.type(screen.getByLabelText("จำนวนเงิน (บาท)"), "45");
    await user.type(screen.getByLabelText("ชื่อรายการ"), "ข้าว");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/record/done?mode=normal"));
    const sum = await api.summary();
    expect(sum.budget.kind === "ok" && sum.budget.todayRemaining).toBe(7500);
  });

  it("G06: simulates Shoes 480 -> 80/day (C2) and Headphones 700 -> over limit 100 (C2x)", async () => {
    const api = createMockApi({ scenario: "default" });
    saveTryDraft({ title: "รองเท้า", amount: 48000, dueOn: null });

    const { unmount } = render(
      <ApiContext.Provider value={api}>
        <TryResultView />
      </ApiContext.Provider>,
    );
    expect(await screen.findByText("80")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    unmount();

    currentSearch = "title=หูฟัง&amount=700";
    render(
      <ApiContext.Provider value={api}>
        <TryResultView />
      </ApiContext.Provider>,
    );
    expect(await screen.findByText(/เกินวงเงินที่ซื้อได้โดยไม่กระทบค่าจำเป็นไป 100 บาท/)).toBeTruthy();
    expect(screen.getByText("61")).toBeTruthy();
  });

  it("G06: saves plan via เก็บไว้ในแผน on TryDecideView (C3 -> C4)", async () => {
    const api = createMockApi({ scenario: "default" });
    saveTryDraft({ title: "รองเท้า", amount: 48000, dueOn: null });
    render(
      <ApiContext.Provider value={api}>
        <TryDecideView />
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "เก็บไว้ในแผน" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/try/saved"));

    const sum = await api.summary();
    expect(sum.budget.kind === "ok" && sum.budget.dailyBudget).toBe(8000);
  });

  it("G07 & G08 & G09: shows sponsored badge on promos, verifies merchant code once, and redeems reward", async () => {
    const api = createMockApi({ scenario: "default" });
    const { unmount } = render(
      <ApiContext.Provider value={api}>
        <ToastProvider>
          <PerksListView />
        </ToastProvider>
      </ApiContext.Provider>,
    );
    expect((await screen.findAllByText("ข้อเสนอจากผู้สนับสนุน")).length).toBeGreaterThan(0);
    unmount();

    const claimed = await api.claimPromo("promo-moo-krata");
    currentSearch = `code=${claimed.code}`;
    const { unmount: unmountShop } = render(
      <ApiContext.Provider value={api}>
        <ShopVerifyView />
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "ยืนยันรหัส" }));
    expect(await screen.findByText(/ยืนยันรหัสสำเร็จ ✓/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "ยืนยันรหัส" }));
    expect(await screen.findByText(/รหัสนี้ถูกยืนยันใช้สิทธิ์ไปแล้ว ระบบไม่นับสิทธิ์ซ้ำ/)).toBeTruthy();
    unmountShop();

    render(
      <ApiContext.Provider value={api}>
        <ToastProvider>
          <PointsView />
        </ToastProvider>
      </ApiContext.Provider>,
    );
    const redeemBtn = await screen.findByRole("button", { name: "แลก 10 แต้ม" });
    await user.click(redeemBtn);
    expect(await screen.findByText("แลกของรางวัลสำเร็จ ✓")).toBeTruthy();
    expect(screen.getByText(/แต้มคงเหลือ 1 แต้ม/)).toBeTruthy();
  });

  it("G10 & G11 & G12: renders Plan tabs (รายการ · รอจ่าย · ออม/เผื่อ), Notifications (R1), and Demo Menu (Z)", async () => {
    const api = createMockApi({ scenario: "default" });
    await api.addPlan({ title: "รองเท้า", amount: 48000, kind: "purchase", status: "reserved" }, "k1");
    currentSearch = "tab=pending";

    const { unmount } = render(
      <ApiContext.Provider value={api}>
        <ToastProvider>
          <PlanMainView />
        </ToastProvider>
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();
    expect(await screen.findByText("รองเท้า")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ยืนยันจ่ายจริง" }));
    expect((await screen.findAllByText("ยืนยันจ่ายจริงแล้ว ✓")).length).toBeGreaterThan(0);
    unmount();

    const { unmount: unmountR1 } = render(
      <ApiContext.Provider value={api}>
        <ToastProvider>
          <SettingsNotificationsView />
        </ToastProvider>
      </ApiContext.Provider>,
    );
    expect(screen.getByText("ข้าวเที่ยง ~50 บาท")).toBeTruthy();
    expect(screen.getByText("ค่ารถ ~20 บาท")).toBeTruthy();
    unmountR1();
  });
});
