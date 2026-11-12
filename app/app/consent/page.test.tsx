// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import ConsentPage from "./page";

afterEach(() => {
  cleanup();
  replace.mockClear();
});

async function submit(err: unknown) {
  const api = createMockApi({ consented: false });
  vi.spyOn(api, "acceptConsent").mockRejectedValue(err);
  render(
    <ApiContext.Provider value={api}>
      <ConsentPage />
    </ApiContext.Provider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "เริ่มต้นใช้งาน" }));
}

describe("ConsentPage (A1 / A1b / A1c)", () => {
  it("expands privacy details (A1b) and redirects to /app/setup/income after accepting (A1c)", async () => {
    const api = createMockApi({ consented: false });
    const spy = vi.spyOn(api, "acceptConsent");
    render(
      <ApiContext.Provider value={api}>
        <ConsentPage />
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();
    const startBtn = screen.getByRole("button", { name: "เริ่มต้นใช้งาน" }) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: /อ่านรายละเอียดการใช้ข้อมูล/ }));
    expect(screen.getByText(/รูปใบเสร็จและสลิป \(OCR\)/)).toBeTruthy();

    await user.click(screen.getByRole("checkbox"));
    expect(startBtn.disabled).toBe(false);

    await user.click(startBtn);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/app/setup/income");
  });

  it("shows an ApiError message and re-enables the button", async () => {
    await submit(new ApiError(500, "boom", "เซิร์ฟเวอร์ขัดข้อง"));
    expect((await screen.findByRole("alert")).textContent).toBe("เซิร์ฟเวอร์ขัดข้อง");
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "เริ่มต้นใช้งาน" }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a generic message for other errors", async () => {
    await submit(new Error("x"));
    expect((await screen.findByRole("alert")).textContent).toBe("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  });
});
