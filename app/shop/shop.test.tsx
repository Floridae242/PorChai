// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync, globSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  useParams: () => ({}),
}));

import { ShopVerifyView } from "./verify/shop-verify-view";

type Redeem = PorchaiApi["shopRedeem"];

function mount(shopRedeem: Redeem) {
  const base = createMockApi();
  const claimPromo = vi.fn(base.claimPromo);
  const api: PorchaiApi = { ...base, shopRedeem: vi.fn(shopRedeem), claimPromo };
  // No ConsentGate / AppShell: this is exactly how app/shop/layout.tsx mounts the view.
  render(
    <ApiContext.Provider value={api}>
      <ShopVerifyView />
    </ApiContext.Provider>,
  );
  return { api, claimPromo };
}

async function typeCode(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = screen.getByLabelText("รหัสจากลูกค้า");
  await user.clear(input);
  await user.type(input, value);
}

describe("shop verify view", () => {
  beforeEach(() => {
    currentSearch = "";
  });
  afterEach(cleanup);

  it("renders header, an empty code field and no student chrome or links", () => {
    mount(async () => ({ status: "invalid" }));
    expect(screen.getByText("พอใช้ สำหรับร้านค้า")).toBeTruthy();
    expect((screen.getByLabelText("รหัสจากลูกค้า") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("กลับหน้าแอป")).toBeNull();
    expect(document.querySelector('a[href^="/app"]')).toBeNull();
  });

  it("not_implemented shows ยังไม่พร้อมใช้งาน without crashing", async () => {
    const user = userEvent.setup();
    mount(async () => {
      throw new ApiError(501, "not_implemented", "ยังไม่พร้อมใช้งาน");
    });
    await typeCode(user, "pc-1234");
    await user.click(screen.getByRole("button", { name: "ตรวจรหัส" }));
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
  });

  it("other ApiError shows its Thai message as an error banner", async () => {
    const user = userEvent.setup();
    mount(async () => {
      throw new ApiError(500, "server_error", "ระบบขัดข้อง");
    });
    await typeCode(user, "PC-1234");
    await user.click(screen.getByRole("button", { name: "ตรวจรหัส" }));
    expect((await screen.findByRole("alert")).textContent).toContain("ระบบขัดข้อง");
  });

  it("network failure allows retry", async () => {
    const user = userEvent.setup();
    const { api } = mount(async () => {
      throw new TypeError("fetch failed");
    });
    await typeCode(user, "PC-1234");
    await user.click(screen.getByRole("button", { name: "ตรวจรหัส" }));
    expect(await screen.findByText("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ตรวจรหัส" }));
    await waitFor(() => expect(api.shopRedeem).toHaveBeenCalledTimes(2));
  });

  it.each([
    [{ status: "redeemed", promoTitle: "ชานมไข่มุก" }, /ใช้ได้ ✓.*ชานมไข่มุก/],
    [{ status: "already_redeemed" }, /รหัสนี้ใช้ไปแล้ว ระบบไม่นับซ้ำ/],
    [{ status: "invalid" }, /ไม่พบรหัสนี้ในระบบ/],
    [{ status: "expired" }, /รหัสนี้หมดอายุแล้ว/],
  ] as const)("renders %j", async (result, text) => {
    const user = userEvent.setup();
    mount(async () => ({ ...result }));
    await typeCode(user, "PC-1234");
    await user.click(screen.getByRole("button", { name: "ตรวจรหัส" }));
    expect(await screen.findByText(text)).toBeTruthy();
    expect(document.querySelector('[data-clarity-mask="true"] [role]')).toBeTruthy();
  });

  it("uppercases and trims the code sent to the API", async () => {
    const user = userEvent.setup();
    const { api } = mount(async () => ({ status: "invalid" }));
    await typeCode(user, "  pc-ab12 ");
    await user.click(screen.getByRole("button", { name: "ตรวจรหัส" }));
    await waitFor(() => expect(api.shopRedeem).toHaveBeenCalledWith("PC-AB12"));
  });

  it("double click and Enter twice send one request; a changed code verifies again", async () => {
    const user = userEvent.setup();
    let release: (v: Awaited<ReturnType<Redeem>>) => void = () => {};
    const { api } = mount(() => new Promise((r) => (release = r)));
    await typeCode(user, "PC-1234");
    await user.dblClick(screen.getByRole("button", { name: "ตรวจรหัส" }));
    await user.type(screen.getByLabelText("รหัสจากลูกค้า"), "{Enter}{Enter}");
    expect(api.shopRedeem).toHaveBeenCalledTimes(1);
    release({ status: "redeemed" });
    await screen.findByText(/ใช้ได้ ✓/);

    await user.type(screen.getByLabelText("รหัสจากลูกค้า"), "X");
    expect(screen.queryByText(/ใช้ได้ ✓/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "ตรวจรหัส" }));
    expect(api.shopRedeem).toHaveBeenCalledTimes(2);
    expect(api.shopRedeem).toHaveBeenLastCalledWith("PC-1234X");
  });

  it("never calls claimPromo", async () => {
    const user = userEvent.setup();
    const { claimPromo } = mount(async () => ({ status: "invalid" }));
    await typeCode(user, "PC-1234");
    await user.click(screen.getByRole("button", { name: "ตรวจรหัส" }));
    await screen.findByText(/ไม่พบรหัสนี้/);
    expect(claimPromo).not.toHaveBeenCalled();
  });

  it("?code= only fills the field", () => {
    currentSearch = "code=pc-9zzz";
    mount(async () => ({ status: "invalid" }));
    expect((screen.getByLabelText("รหัสจากลูกค้า") as HTMLInputElement).value).toBe("PC-9ZZZ");
  });
});

describe("shop route structure", () => {
  it("every app/shop page exports instant = false from a server file", () => {
    const pages = globSync("app/shop/**/page.tsx");
    expect(pages.length).toBeGreaterThanOrEqual(1);
    for (const file of pages) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/^export const instant = false;?$/m);
      expect(src, file).not.toMatch(/^["']use client["']/m);
    }
  });

  it("the shop layout has no ConsentGate or AppShell and the old /app/shop is gone", () => {
    const layout = readFileSync("app/shop/layout.tsx", "utf8");
    expect(layout).not.toMatch(/ConsentGate|AppShell/);
    expect(layout).toMatch(/LiffProvider/);
    expect(layout).toMatch(/export const instant = false/);
    expect(existsSync("app/app/shop")).toBe(false);
  });

  it("no student screen links to the shop page, and the shop view has no mock or /app links", () => {
    expect(readFileSync("app/app/perks/perks-views.tsx", "utf8")).not.toMatch(/shop\/verify|ShopVerifyView/);
    const view = readFileSync("app/shop/verify/shop-verify-view.tsx", "utf8");
    expect(view).not.toMatch(/claimPromo|mock-fixtures|\/app/);
  });
});
