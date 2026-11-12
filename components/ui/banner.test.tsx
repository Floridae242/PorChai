// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Banner } from "./banner";

afterEach(cleanup);

describe("Banner", () => {
  it("error uses role alert", () => {
    render(<Banner kind="error" text="บันทึกไม่สำเร็จ" />);
    expect(screen.getByRole("alert").textContent).toContain("บันทึกไม่สำเร็จ");
  });
  it("info and warn use role status", () => {
    render(
      <>
        <Banner kind="info" text="a" />
        <Banner kind="warn" text="b" action={{ label: "ดู", href: "/x" }} />
      </>,
    );
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "ดู" }).getAttribute("href")).toBe("/x");
  });
});

describe("Banner action onClick", () => {
  it("renders a button that calls onClick", async () => {
    const onClick = vi.fn();
    render(<Banner kind="warn" text="t" action={{ label: "ลองใหม่", onClick }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
