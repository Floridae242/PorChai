// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MiniApp from "./miniapp";
import { initializeLiff } from "@/lib/line/liff-client";
import { verifyMiniAppUser } from "@/lib/line/miniapp-user";

vi.mock("@/lib/line/liff-client", () => ({ initializeLiff: vi.fn() }));
vi.mock("@/lib/line/miniapp-user", () => ({ verifyMiniAppUser: vi.fn() }));

const liff = {
  isLoggedIn: vi.fn(() => false),
  getIDToken: vi.fn(() => "dummy-id-token"),
  login: vi.fn(),
};
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "2012545254-6025ZG1r");
  vi.clearAllMocks();
  liff.isLoggedIn.mockReturnValue(false);
  vi.mocked(initializeLiff).mockResolvedValue(liff as never);
  window.history.replaceState(null, "", "/miniapp");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("LIFF entry and server verification", () => {
  it("logs in directly under /app with the chosen destination, never an external return URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/miniapp?returnTo=https://evil.example",
    );
    render(<MiniApp />);
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /จดรายจ่าย/ }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: /จดรายจ่าย/ }));
    await waitFor(() => expect(liff.login).toHaveBeenCalledOnce());
    const callback = new URL(liff.login.mock.calls[0][0].redirectUri);
    expect(callback.origin).toBe(window.location.origin);
    expect(callback.pathname).toBe("/app/record/new");
    expect(callback.search).toBe("");
    expect(verifyMiniAppUser).not.toHaveBeenCalled();
  });
  it("shows only server-verified identity", async () => {
    liff.isLoggedIn.mockReturnValue(true);
    vi.mocked(verifyMiniAppUser).mockResolvedValue({
      id: "verified-user",
      name: "Naruephon",
    });
    render(<MiniApp />);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Naruephon"),
    );
    expect(verifyMiniAppUser).toHaveBeenCalledWith("dummy-id-token");
    expect(
      screen.getByRole("link", { name: /เปิดแผนของฉัน/ }).getAttribute("href"),
    ).toBe("/app");
  });
  it("does not unlock financial routes after failed server verification", async () => {
    liff.isLoggedIn.mockReturnValue(true);
    vi.mocked(verifyMiniAppUser).mockRejectedValue(
      new Error("ยืนยันตัวตนไม่สำเร็จ"),
    );
    render(<MiniApp />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: /จดรายจ่าย/ })).toBeNull();
  });
});
