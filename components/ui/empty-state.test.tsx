// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders a link action with href", () => {
    render(<EmptyState title="t" action={{ label: "ไป", href: "/record" }} />);
    expect(screen.getByRole("link", { name: "ไป" }).getAttribute("href")).toBe("/record");
  });
  it("renders a button action with onClick", async () => {
    const onClick = vi.fn();
    render(<EmptyState title="t" action={{ label: "เพิ่ม", onClick }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "เพิ่ม" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
