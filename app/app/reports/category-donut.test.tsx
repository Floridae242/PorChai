// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryDonut } from "./category-donut";

const categories = [
  { category: "food", amount: 30000, count: 2 },
  { category: "transport", amount: 10000, count: 1 },
] as never;

afterEach(cleanup);

describe("CategoryDonut", () => {
  it("shows the server total in the centre and every category as a named row", () => {
    render(<CategoryDonut categories={categories} spending={40000} />);
    expect(screen.getByText("รายจ่ายรวม")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getAllByRole("button")[0].textContent).toContain("300");
    expect(document.body.textContent).not.toContain("%");
  });

  it("tapping a row puts that category's amount in the centre; tapping again clears it", () => {
    render(<CategoryDonut categories={categories} spending={40000} />);
    const [food] = screen.getAllByRole("button");
    fireEvent.click(food);
    expect(food.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("รายจ่ายรวม")).toBeNull();
    fireEvent.click(food);
    expect(screen.getByText("รายจ่ายรวม")).toBeTruthy();
  });

  it("says so when there is no spending, with no ring", () => {
    const { container } = render(
      <CategoryDonut categories={[]} spending={0} />,
    );
    expect(screen.getByText("ยังไม่มีรายจ่ายในช่วงนี้")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });
});
