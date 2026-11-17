// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

let pathname = "/app";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  pathname = "/app";
});

describe("AppShell", () => {
  it("marks the summary link current on /app", () => {
    render(<AppShell>เนื้อหา</AppShell>);
    const current = screen.getAllByRole("link", { name: "สรุป" });
    expect(current.length).toBeGreaterThan(0);
    for (const l of current)
      expect(l.getAttribute("aria-current")).toBe("page");
    for (const l of screen.getAllByRole("link", { name: "ตั้งค่า" })) {
      expect(l.getAttribute("aria-current")).toBeNull();
    }
  });

  it("opens the record chooser from จด", async () => {
    const user = userEvent.setup();
    render(<AppShell>x</AppShell>);
    await user.click(screen.getAllByRole("button", { name: "จด" })[0]);
    const dialog = screen.getByRole("dialog", { name: "จะจดอะไร" });
    expect(dialog).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "จดรายจ่าย" }).getAttribute("href"),
    ).toBe("/app/record/new?type=expense");
    expect(
      screen.getByRole("link", { name: "จดรายรับ" }).getAttribute("href"),
    ).toBe("/app/record/new?type=income");
    expect(
      screen.getByRole("link", { name: "ลองก่อนจ่าย" }).getAttribute("href"),
    ).toBe("/app/try");
    expect(screen.getByRole("button", { name: "ยกเลิก" })).not.toBeNull();
  });

  it("renders no navigation on /app/consent", () => {
    pathname = "/app/consent";
    render(<AppShell>เนื้อหา</AppShell>);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link", { name: "สรุป" })).toBeNull();
    expect(screen.getByText("เนื้อหา")).not.toBeNull();
  });
});

describe("AppShell clarity mask", () => {
  it("masks the content wrapper", () => {
    const { container } = render(<AppShell>เนื้อหา</AppShell>);
    expect(
      container.querySelector('[data-clarity-mask="true"]')?.textContent,
    ).toContain("เนื้อหา");
  });
  it("masks the content wrapper on nav-less pages", () => {
    pathname = "/app/consent";
    const { container } = render(<AppShell>เนื้อหา</AppShell>);
    expect(
      container.querySelector('[data-clarity-mask="true"]')?.textContent,
    ).toContain("เนื้อหา");
  });

  it("has a refresh button that mounts the page again so it loads its data again", async () => {
    let mounts = 0;
    function Probe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <p>หน้า</p>;
    }
    const user = userEvent.setup();
    render(
      <AppShell>
        <Probe />
      </AppShell>,
    );
    expect(mounts).toBe(1);
    await user.click(screen.getByRole("button", { name: "รีเฟรชข้อมูล" }));
    expect(mounts).toBe(2);
  });

  it("shows no refresh button on screens without the navigation (consent, setup)", () => {
    pathname = "/app/consent";
    render(<AppShell>เนื้อหา</AppShell>);
    expect(screen.queryByRole("button", { name: "รีเฟรชข้อมูล" })).toBeNull();
  });
});
