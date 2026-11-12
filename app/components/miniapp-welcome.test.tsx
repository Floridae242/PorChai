// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MiniAppWelcome } from "./miniapp-welcome";

afterEach(cleanup);
const props = {
  status: "login" as const,
  name: null,
  error: null,
  busy: false,
  onLogin: vi.fn(),
};

describe("branded LIFF entry", () => {
  it("disables the next arrow at the actual scroll boundary even when three cards are visible", () => {
    render(<MiniAppWelcome {...props} />);
    const rail = screen.getByRole("article", {
      name: "1. พิมพ์แล้วจดเลย",
    }).parentElement!;
    Object.defineProperties(rail, {
      clientWidth: { value: 800 },
      scrollWidth: { value: 1070 },
      scrollLeft: { value: 270, configurable: true },
    });
    fireEvent.scroll(rail);
    expect(
      (screen.getByRole("button", { name: "การ์ดถัดไป" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "การ์ดก่อนหน้า" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    Object.defineProperty(rail, "scrollLeft", { value: 0 });
    fireEvent.scroll(rail);
    expect(
      (screen.getByRole("button", { name: "การ์ดก่อนหน้า" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("routes a new user's selected action through LINE login", () => {
    const login = vi.fn();
    render(<MiniAppWelcome {...props} onLogin={login} />);
    fireEvent.click(screen.getByRole("button", { name: /จดรายจ่าย/ }));
    expect(login).toHaveBeenCalledWith("/app/record/new");
  });
  it("shows the verified name and real route links after verification", () => {
    render(<MiniAppWelcome {...props} status="ready" name="Naruephon" />);
    expect(screen.getByRole("status").textContent).toContain("Naruephon");
    expect(
      screen.getByRole("link", { name: /จดรายจ่าย/ }).getAttribute("href"),
    ).toBe("/app/record/new");
    expect(screen.queryByText("+1 แต้ม")).toBeNull();
  });
  it("disables login actions while connecting and exposes useful errors", () => {
    const { rerender } = render(<MiniAppWelcome {...props} status="loading" />);
    expect(
      (
        screen.getByRole("button", {
          name: /เริ่มใช้งานด้วย LINE/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    rerender(
      <MiniAppWelcome {...props} status="error" error="ยืนยันตัวตนไม่สำเร็จ" />,
    );
    expect(screen.getByRole("alert").textContent).toContain("ยืนยันตัวตนไม่สำเร็จ");
  });
  it("uses motion alternatives and opt-in videos", () => {
    const { container } = render(<MiniAppWelcome {...props} />);
    expect(
      container.querySelector(
        'source[media="(prefers-reduced-motion: no-preference)"]',
      ),
    ).not.toBeNull();
    expect(
      [...container.querySelectorAll("video")].every(
        (v) => !v.autoplay && v.controls && v.preload === "none",
      ),
    ).toBe(true);
  });
});
