// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MoneyDirection } from "./money-direction";

afterEach(cleanup);

it("received money: a green circle that is read as เงินเข้า", () => {
  render(<MoneyDirection kind="income" />);
  const el = screen.getByRole("img", { name: "เงินเข้า" });
  expect(el.className).toContain("text-ok");
  expect(el.querySelector("svg")).toBeTruthy();
});

it("spent money: a neutral circle that is read as เงินออก", () => {
  render(<MoneyDirection kind="expense" />);
  const el = screen.getByRole("img", { name: "เงินออก" });
  expect(el.className).toContain("text-secondary");
  expect(el.className).not.toContain("text-ok");
});
