// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shell/toast";
import { loadClaimedCode, saveClaimedCode } from "@/lib/client/claimed-code";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi, Promo, Reward } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

const push = vi.fn();
const replace = vi.fn();
let currentParams: Record<string, string> = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => currentParams,
}));

import { PerkCodeView, PerkDetailView, PerksListView, PerkUsedView, PointsView } from "./perks-views";

const notImpl = () => Promise.reject(new ApiError(501, "not_implemented", "ฟีเจอร์นี้ยังไม่พร้อมใช้งาน"));

const PROMO: Promo = {
  id: "p1",
  shop: "ร้านทดสอบ",
  title: "ชุดทดสอบ",
  price: 12900,
  validDays: "ทุกวัน",
  terms: ["เงื่อนไขหนึ่ง"],
  sponsored: true,
  fitsBudget: null,
  leftAfter: null,
  overBy: null,
};

function apiWith(over: Partial<PorchaiApi>): PorchaiApi {
  return { ...createMockApi({ scenario: "default" }), ...over };
}

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
  currentParams = {};
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe("P1 list", () => {
  it("promos not_implemented -> honest empty state, no cards, points row shows 0", async () => {
    renderWith(apiWith({ promos: notImpl, points: notImpl }), <PerksListView />);
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    expect(screen.queryByText("ข้อเสนอจากผู้สนับสนุน")).toBeNull();
    expect(screen.queryByRole("link", { name: /ดูรายละเอียดและรับสิทธิ์/ })).toBeNull();
    expect(screen.getByText("0 แต้ม")).toBeTruthy();
    expect(screen.queryByText(/\b11 แต้ม/)).toBeNull();
    expect(screen.getByRole("link", { name: /ดูของที่แลกได้/ }).getAttribute("href")).toBe("/app/points");
  });

  it("promos failure -> error with retry that reloads", async () => {
    const promos = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([PROMO]);
    renderWith(apiWith({ promos }), <PerksListView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("ชุดทดสอบ")).toBeTruthy();
    expect(screen.getByText("ข้อเสนอจากผู้สนับสนุน")).toBeTruthy();
    expect(promos).toHaveBeenCalledTimes(2);
  });

  it("real promos carry the sponsor badge and a server-only budget line", async () => {
    const over: Promo = { ...PROMO, id: "p2", title: "แพง", fitsBudget: false, leftAfter: -5000, overBy: 5000 };
    renderWith(apiWith({ promos: async () => [PROMO, over] }), <PerksListView />);
    expect((await screen.findAllByText("ข้อเสนอจากผู้สนับสนุน")).length).toBe(2);
    expect(screen.getByText("เกินงบวันนี้ 50 บาท")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/-50|−50/);
  });
});

describe("P2 detail", () => {
  it("fits: shows the server's leftAfter", async () => {
    currentParams = { id: "p1" };
    renderWith(apiWith({ promo: async () => ({ ...PROMO, fitsBudget: true, leftAfter: 2100, overBy: 0 }) }), <PerkDetailView />);
    expect(await screen.findByText(/ซื้อได้ · เหลือ 21 บาท/)).toBeTruthy();
  });

  it("over: shows the server's overBy and never a negative number", async () => {
    currentParams = { id: "p1" };
    renderWith(
      apiWith({ promo: async () => ({ ...PROMO, fitsBudget: false, leftAfter: -3000, overBy: 3000 }) }),
      <PerkDetailView />,
    );
    expect(await screen.findByText(/เกินงบวันนี้ 30 บาท/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/-30|−30|-\d/);
  });

  it("unknown budget -> no comparison line; terms come from the server only", async () => {
    currentParams = { id: "p1" };
    renderWith(apiWith({ promo: async () => PROMO }), <PerkDetailView />);
    expect(await screen.findByText("เงื่อนไขหนึ่ง")).toBeTruthy();
    expect(screen.queryByText(/เทียบกับแผนของคุณ/)).toBeNull();
    expect(screen.queryByText(/แสดงรหัสหรือ QR/)).toBeNull();
  });

  it("promo not_implemented -> honest state; missing id -> not found (no fixture fallback)", async () => {
    currentParams = { id: "p1" };
    const { unmount } = renderWith(apiWith({ promo: notImpl }), <PerkDetailView />);
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    unmount();
    currentParams = {};
    const promo = vi.fn();
    renderWith(apiWith({ promo }), <PerkDetailView />);
    expect(await screen.findByText("ไม่พบโปรโมชันนี้")).toBeTruthy();
    expect(promo).not.toHaveBeenCalled();
  });

  it("does NOT claim on mount; claims once on a double tap, stores the claim, goes to P3", async () => {
    currentParams = { id: "p1" };
    const claimPromo = vi.fn(async () => ({ code: "PC-7K3Q", expiresAt: "2026-12-01" }));
    renderWith(apiWith({ promo: async () => PROMO, claimPromo }), <PerkDetailView />);
    const btn = await screen.findByRole("button", { name: "รับรหัส" });
    expect(claimPromo).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.dblClick(btn);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/perks/p1/code"));
    expect(claimPromo).toHaveBeenCalledTimes(1);
    expect(loadClaimedCode("p1")).toEqual({ code: "PC-7K3Q", expiresAt: "2026-12-01" });
  });

  it("claim not_implemented -> ยังไม่พร้อมใช้งาน, no navigation, nothing stored", async () => {
    currentParams = { id: "p1" };
    renderWith(apiWith({ promo: async () => PROMO, claimPromo: notImpl }), <PerkDetailView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "รับรหัส" }));
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(loadClaimedCode("p1")).toBeNull();
  });

  it("the try link carries the price as plain baht text", async () => {
    currentParams = { id: "p1" };
    renderWith(apiWith({ promo: async () => PROMO }), <PerkDetailView />);
    const link = await screen.findByRole("link", { name: "ลองก่อนจ่ายด้วยราคานี้" });
    expect(link.getAttribute("href")).toContain("amount=129");
  });
});

describe("P3 code / P3b", () => {
  it("only reads the stored claim: shows the code, waits for the shop, never claims, no simulate control", async () => {
    currentParams = { id: "p1" };
    saveClaimedCode("p1", { code: "PC-7K3Q", expiresAt: "2026-12-01" });
    const claimPromo = vi.fn();
    renderWith(apiWith({ promo: async () => PROMO, claimPromo }), <PerkCodeView />);
    expect(await screen.findByText("PC-7K3Q")).toBeTruthy();
    expect(screen.getByText(/รอร้านยืนยัน/)).toBeTruthy();
    expect(claimPromo).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/จำลอง/)).toBeNull();
    expect(screen.queryByRole("button", { name: /ร้านยืนยันแล้ว/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /ร้านยืนยันแล้ว/ })).toBeNull();
    expect(document.querySelector("canvas, [aria-label*='QR']")).toBeNull();
  });

  it("without a stored claim it redirects to P2 and never claims", async () => {
    currentParams = { id: "p1" };
    const claimPromo = vi.fn();
    renderWith(apiWith({ claimPromo }), <PerkCodeView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/perks/p1"));
    expect(claimPromo).not.toHaveBeenCalled();
  });

  it("P3b: no claim -> redirect to P2; with a claim it says not ready (no fake success)", async () => {
    currentParams = { id: "p1" };
    const { unmount } = renderWith(apiWith({}), <PerkUsedView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/perks/p1"));
    unmount();
    saveClaimedCode("p1", { code: "PC-7K3Q", expiresAt: "2026-12-01" });
    renderWith(apiWith({}), <PerkUsedView />);
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    expect(screen.queryByText(/ใช้โปรสำเร็จ/)).toBeNull();
  });
});

describe("K1 points / K2", () => {
  const REWARD: Reward = { id: "r1", name: "สติกเกอร์", cost: 5, stock: 3 };

  it("points unavailable -> 0 แต้ม (never 11); claim -> ยังไม่พร้อมใช้งาน and points unchanged", async () => {
    renderWith(apiWith({ points: notImpl, claimPoints: notImpl, rewards: async () => [] }), <PointsView />);
    expect(await screen.findByText("แต้มสะสม")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByText("11")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "รับแต้มฟรี" }));
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByText(/รับแต้มฟรีแล้ว/)).toBeNull();
  });

  it("claim success uses the server balance and a double tap sends once", async () => {
    const claimPoints = vi.fn(async () => ({ balance: 7, claimedToday: true as const }));
    renderWith(
      apiWith({ points: async () => ({ balance: 6, claimedToday: false }), claimPoints, rewards: async () => [] }),
      <PointsView />,
    );
    const user = userEvent.setup();
    await user.dblClick(await screen.findByRole("button", { name: "รับแต้มฟรี" }));
    expect(await screen.findByText("7")).toBeTruthy();
    expect(claimPoints).toHaveBeenCalledTimes(1);
  });

  it("redeem errors from the server are shown and the user stays on K1", async () => {
    const redeemReward = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, "not_enough_points", "แต้มไม่พอ"))
      .mockRejectedValueOnce(new ApiError(409, "out_of_stock", "ของหมดแล้ว"));
    renderWith(
      apiWith({ points: async () => ({ balance: 1, claimedToday: false }), rewards: async () => [REWARD], redeemReward }),
      <PointsView />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "5 แต้ม" }));
    expect(await screen.findByText("แต้มไม่พอ")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "5 แต้ม" }));
    expect(await screen.findByText("ของหมดแล้ว")).toBeTruthy();
    expect(screen.queryByText("แลกสำเร็จ")).toBeNull();
    expect(screen.getByText("แต้มสะสม")).toBeTruthy();
  });

  it("redeem double tap sends once; success shows the server's code and balance (K2) and can go back", async () => {
    const redeemReward = vi.fn(async () => ({ balance: 4, code: "RW-58QD" }));
    const rewards = vi.fn(async () => [REWARD]);
    renderWith(apiWith({ points: async () => ({ balance: 9, claimedToday: false }), rewards, redeemReward }), <PointsView />);
    const user = userEvent.setup();
    await user.dblClick(await screen.findByRole("button", { name: "5 แต้ม" }));
    expect(await screen.findByText("RW-58QD")).toBeTruthy();
    expect(redeemReward).toHaveBeenCalledTimes(1);
    const summary = screen.getByText("แลกสำเร็จ").closest("section") as HTMLElement;
    expect(within(summary).getByText("4 แต้ม")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "กลับหน้าแต้ม" }));
    expect(await screen.findByText("แต้มสะสม")).toBeTruthy();
    expect(rewards).toHaveBeenCalledTimes(2);
  });

  it("rewards not_implemented -> info state instead of a list; rewards failure -> retry", async () => {
    const { unmount } = renderWith(apiWith({ rewards: notImpl }), <PointsView />);
    expect(await screen.findByText(/ยังไม่พร้อมใช้งาน/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^\d+ แต้ม$/ })).toBeNull();
    unmount();

    const rewards = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([REWARD]);
    renderWith(apiWith({ rewards }), <PointsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("สติกเกอร์")).toBeTruthy();
  });
});
