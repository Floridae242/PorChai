// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BillCalendar } from "./bill-calendar";
afterEach(cleanup);
describe("bill date calendar", () => {
  it("selects dates with keyboard/click and marks bills and today", async () => {
    const select = vi.fn();
    render(
      <BillCalendar
        month="2027-02"
        today="2027-02-15"
        selected="2027-02-15"
        counts={{ "2027-02-28": 2 }}
        onMonth={() => {}}
        onSelect={select}
      />,
    );
    expect(
      screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("aria-label")?.startsWith("2027-02")),
    ).toHaveLength(28);
    const date = screen.getByRole("button", { name: "2027-02-28 มี 2 บิล" });
    date.focus();
    await userEvent.keyboard("{Enter}");
    expect(select).toHaveBeenCalledWith("2027-02-28");
    expect(
      screen
        .getByRole("button", { name: "2027-02-15" })
        .getAttribute("aria-current"),
    ).toBe("date");
  });
  it("navigates December into January and includes leap day", async () => {
    const month = vi.fn();
    const { rerender } = render(
      <BillCalendar
        month="2026-12"
        today="2026-12-01"
        selected="2026-12-01"
        onMonth={month}
        onSelect={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "เดือนถัดไป" }));
    expect(month).toHaveBeenCalledWith("2027-01");
    rerender(
      <BillCalendar
        month="2028-02"
        today="2028-02-01"
        selected="2028-02-01"
        onMonth={month}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "2028-02-29" })).toBeTruthy();
  });
});
