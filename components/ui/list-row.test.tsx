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

describe("ListRow tone", () => {
  it("income colours the amount green, default stays the normal text colour", () => {
    render(
      <>
        <ListRow title="a" amount="+50 บาท" tone="income" />
        <ListRow title="b" amount="−45 บาท" />
      </>,
    );
    expect(screen.getByText("+50 บาท").className).toContain("text-ok");
    expect(screen.getByText("−45 บาท").className).toContain("text-primary");
  });
});

describe("ListRow income row", () => {
  it("has a soft green row, a green bar on its left edge and the leading icon", () => {
    const { container } = render(<ListRow title="a" amount="+50 บาท" tone="income" leading={<i data-testid="lead" />} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("bg-subtle");
    expect(row.className).not.toContain("bg-card");
    expect(row.className).toContain("relative");
    expect(row.querySelector("span[aria-hidden].bg-action-primary")).toBeTruthy();
    expect(screen.getByTestId("lead")).toBeTruthy();
  });
  it("a normal row has no bar and keeps the card background", () => {
    const { container } = render(<ListRow title="a" amount="−45 บาท" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("bg-card");
    expect(row.querySelector(".bg-action-primary")).toBeNull();
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
