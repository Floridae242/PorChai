// @vitest-environment jsdom
import { afterEach, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MockPromotionBanner,
  SponsorShowcase,
} from "../promotions/promotion-mock-view";
afterEach(cleanup);
it("labels mock advertising, uses the public readonly showcase, and can be dismissed", async () => {
  render(<MockPromotionBanner />);
  expect(
    screen.getByRole("complementary", { name: "โฆษณาตัวอย่าง" }),
  ).toBeTruthy();
  expect(screen.getByRole("link").getAttribute("href")).toBe("/app/sponsors");
  expect(screen.getByText(/ใช้ซื้อจริงไม่ได้/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "ปิดโฆษณาตัวอย่าง" }));
  expect(screen.queryByRole("complementary")).toBeNull();
});
it("never presents a real coupon code, payment or reward redemption", () => {
  render(<SponsorShowcase />);
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.queryByText(/DEMO-/)).toBeNull();
  expect(screen.queryByRole("button", { name: /รับรหัส|ซื้อ|แลก/ })).toBeNull();
});
