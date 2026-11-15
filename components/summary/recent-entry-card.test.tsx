// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RecentEntryCard } from "./recent-entry-card";

afterEach(cleanup);
it("shows the API's actual satang amount and entry link without changing financial state", () => {
  render(
    <RecentEntryCard
      entry={{
        id: "entry-real",
        amount: 5075,
        category: "food",
        note: "ข้าวเที่ยง",
        spentOn: "2026-11-12",
        source: "chat",
        createdAt: "2026-11-12T05:00:00Z",
      }}
    />,
  );
  expect(screen.getByText("−฿50.75")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "ดูหรือแก้ไข ข้าวเที่ยง" }).getAttribute("href"),
  ).toBe("/app/record/entry-real");
  expect(screen.getByText(/จดจาก LINE/)).toBeTruthy();
});
