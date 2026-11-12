// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListRow } from "./list-row";

afterEach(cleanup);

describe("ListRow", () => {
  it("renders a link with href", () => {
    render(<ListRow title="a" href="/x" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/x");
  });
  it("renders a button with onClick", () => {
    render(<ListRow title="a" onClick={() => {}} />);
    expect(screen.getByRole("button")).toBeTruthy();
  });
  it("renders a div otherwise, and masks amount", () => {
    const { container } = render(<ListRow title="a" amount="1,200" />);
    expect(container.firstElementChild!.tagName).toBe("DIV");
    expect(screen.getByText("1,200").getAttribute("data-clarity-mask")).toBe("true");
  });
});

describe("ListRow link + onClick", () => {
  it("calls onClick on a link row", async () => {
    const onClick = vi.fn((e?: unknown) => void e);
    render(<ListRow title="a" href="#x" onClick={() => onClick()} />);
    await userEvent.setup().click(screen.getByRole("link"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
