// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
