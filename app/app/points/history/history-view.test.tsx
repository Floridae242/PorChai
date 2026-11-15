// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { PointsHistoryView } from "./history-view";

afterEach(cleanup);
const renderWith = (api: PorchaiApi) =>
  render(
    <ApiContext.Provider value={api}>
      <PointsHistoryView />
    </ApiContext.Provider>,
  );

describe("points history", () => {
  it("a new user sees an honest empty state, not invented rows", async () => {
    renderWith(createMockApi({ scenario: "default" }));
    expect(await screen.findByText("ยังไม่มีประวัติแต้ม")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "ประวัติแต้ม" })).toBeNull();
  });

  it("lists a daily point and a redemption, newest first, with the signs from the server's numbers", async () => {
    const api = createMockApi({ scenario: "default" });
    await api.claimPoints("k1"); // +1
    const [reward] = await api.rewards();
    await api.redeemReward(reward.id, "k2"); // costs the reward's price
    renderWith(api);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain(`แลก ${reward.name}`);
    expect(rows[0].textContent).toContain(`−${reward.cost} แต้ม`);
    expect(rows[1].textContent).toContain("แต้มประจำวัน");
    expect(rows[1].textContent).toContain("+1 แต้ม");
  });

  it("claiming twice in one day shows one row", async () => {
    const api = createMockApi({ scenario: "default" });
    await api.claimPoints("a");
    await api.claimPoints("b");
    renderWith(api);
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
  });

  it("the reward code is never on the page", async () => {
    const api = createMockApi({ scenario: "default" });
    const [reward] = await api.rewards();
    const { code } = await api.redeemReward(reward.id, "k");
    renderWith(api);
    await screen.findAllByRole("listitem");
    expect(document.body.textContent).not.toContain(code);
  });

  it("not implemented -> ยังไม่พร้อมใช้งาน; failure -> retry that works", async () => {
    const api = createMockApi({ scenario: "default" });
    vi.spyOn(api, "pointsHistory").mockRejectedValueOnce(new ApiError(501, "not_implemented", "x"));
    renderWith(api);
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    cleanup();

    const api2 = createMockApi({ scenario: "default" });
    vi.spyOn(api2, "pointsHistory").mockRejectedValueOnce(new ApiError(500, "internal", "x"));
    renderWith(api2);
    expect(await screen.findByText(/โหลดประวัติแต้มไม่สำเร็จ/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("ยังไม่มีประวัติแต้ม")).toBeTruthy();
  });
});
