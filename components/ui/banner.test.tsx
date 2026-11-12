// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
