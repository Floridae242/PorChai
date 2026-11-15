// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiContext } from "./use-api";
import { createMockApi } from "./mock";
import { usePoints, publishPoints } from "./use-points";
import { withDataEvents, DATA_CHANGED } from "./data-events";
import type { PorchaiApi } from "./types";
function Probe({ name }: { name: string }) {
  const p = usePoints();
  return (
    <div data-testid={name}>
      {p.data?.balance ?? "unknown"}|
      {p.data?.claimedToday ? "claimed" : "unclaimed"}|
      {p.failed ? "failed" : "ok"}
      <button onClick={() => void p.refresh()}>refresh {name}</button>
    </div>
  );
}
function mount(api: PorchaiApi) {
  return render(
    <ApiContext.Provider value={api}>
      <Probe name="home" />
      <Probe name="perks" />
    </ApiContext.Provider>,
  );
}
afterEach(cleanup);
describe("shared authoritative point state", () => {
  it("coalesces requests across screens and refreshes when returning from LINE", async () => {
    let balance = 3;
    const api = createMockApi();
    const read = vi
      .spyOn(api, "points")
      .mockImplementation(async () => ({ balance, claimedToday: balance > 3 }));
    mount(api);
    await waitFor(() =>
      expect(screen.getByTestId("home").textContent).toContain("3|unclaimed"),
    );
    expect(read).toHaveBeenCalledTimes(1);
    balance = 4;
    fireEvent.focus(window);
    await waitFor(() =>
      expect(screen.getByTestId("perks").textContent).toContain("4|claimed"),
    );
    expect(screen.getByTestId("home").textContent).toContain("4|claimed");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("never lets a slow old GET overwrite a newer claim/redemption result", async () => {
    let resolve!: (p: { balance: number; claimedToday: boolean }) => void;
    const api = createMockApi();
    vi.spyOn(api, "points").mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    mount(api);
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    act(() => publishPoints(api, { balance: 9, claimedToday: true }));
    await act(async () => resolve({ balance: 2, claimedToday: false }));
    expect(screen.getByTestId("home").textContent).toContain("9|claimed");
    expect(screen.getByTestId("perks").textContent).toContain("9|claimed");
  });
  it("keeps missing data unknown and preserves the last confirmed balance on transient failure", async () => {
    const api = createMockApi();
    const read = vi
      .spyOn(api, "points")
      .mockRejectedValue(new Error("offline"));
    mount(api);
    await waitFor(() =>
      expect(screen.getByTestId("home").textContent).toContain(
        "unknown|unclaimed|failed",
      ),
    );
    read.mockResolvedValue({ balance: 7, claimedToday: true });
    fireEvent.click(screen.getByText("refresh home"));
    await waitFor(() =>
      expect(screen.getByTestId("home").textContent).toContain("7|claimed|ok"),
    );
    read.mockRejectedValue(new Error("offline"));
    fireEvent.focus(window);
    await waitFor(() =>
      expect(screen.getByTestId("perks").textContent).toContain(
        "7|claimed|failed",
      ),
    );
  });
  it("refreshes after recording income/expenses, awards once, and clears data after account deletion", async () => {
    const base = createMockApi({ today: "2026-11-15", scenario: "midCycle" }),
      api = withDataEvents(base),
      read = vi.spyOn(base, "points");
    mount(api);
    await waitFor(() =>
      expect(screen.getByTestId("home").textContent).toContain("11|unclaimed"),
    );
    await act(async () => {
      await api.addEntry(
        { amount: 5000, category: "food", note: "ข้าว", spentOn: "2026-11-15" },
        "first",
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId("home").textContent).toContain("12|claimed"),
    );
    expect(screen.getByTestId("perks").textContent).toContain("12|claimed");
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => {
      await api.addIncome(
        { amount: 100000, receivedOn: "2026-11-15" },
        "income",
      );
    });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId("home").textContent).toContain("12|claimed");
    await act(async () => {
      await api.deleteMyData();
    });
    expect(screen.getByTestId("home").textContent).toContain("unknown");
    expect(screen.getByTestId("perks").textContent).toContain("unknown");
  });
  it("does not announce failed writes or accept another API/account's event", async () => {
    const base = createMockApi(),
      read = vi.spyOn(base, "points"),
      bad = vi.spyOn(base, "addIncome").mockRejectedValue(new Error("offline")),
      api = withDataEvents(base);
    mount(api);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await expect(api.addIncome({ amount: 100 }, "failed")).rejects.toThrow(
      "offline",
    );
    expect(bad).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    fireEvent(
      window,
      new CustomEvent(DATA_CHANGED, { detail: { api: createMockApi() } }),
    );
    expect(read).toHaveBeenCalledTimes(1);
  });
});
