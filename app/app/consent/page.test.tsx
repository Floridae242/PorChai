// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

function renderConsent(api = createMockApi({ scenario: "fresh", consented: false })) {
  render(
    <ApiContext.Provider value={api}>
      <ConsentPage />
    </ApiContext.Provider>,
  );
  return api;
}

const START = "ยอมรับและเริ่ม";

describe("ConsentPage (A1 / A1b / A1c)", () => {
  it("shows the data-use cards expanded on first render, with the exact Figma labels and no DEMO chip", () => {
    renderConsent();
    expect(screen.getByText("สิ่งที่เก็บ")).toBeTruthy();
    expect(screen.getByText("ใช้ข้อมูลอย่างไร")).toBeTruthy();
    expect(screen.getByText("สิ่งที่ไม่ทำ")).toBeTruthy();
    expect(screen.getByText("รายการรายรับ/รายจ่ายที่คุณจด")).toBeTruthy();
    expect(screen.getByText("รูปใบเสร็จ/สลิปที่คุณส่ง เพื่ออ่านยอดเป็นรายการร่าง")).toBeTruthy();
    expect(screen.getByText("AI ช่วยอ่านข้อความและอธิบายผล ตัวเลขคิดด้วยระบบ")).toBeTruthy();
    expect(screen.getByText("ร้านค้าเห็นแค่ข้อมูลรวม ไม่เห็นชื่อหรือยอดเงินของคุณ")).toBeTruthy();
    expect(screen.getByText("เตือนผ่าน LINE และสะสมแต้มรายวัน ปิดเตือนได้ในหน้าตั้งค่า")).toBeTruthy();
    expect(screen.getByLabelText("ฉันเข้าใจและยินยอม")).toBeTruthy();
    expect(screen.getByRole("button", { name: START })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/DEMO/i);
    expect(document.querySelector("img")?.getAttribute("width")).toBe("72"); // Figma A1 mascot 72
  });

  it("the full-policy row is collapsed, then expands (A1b) and collapses again", async () => {
    renderConsent();
    const user = userEvent.setup();
    expect(screen.queryByText("ฉบับเต็มกำลังจัดทำ แสดงหัวข้อไว้ก่อน")).toBeNull();
    const row = screen.getByRole("button", { name: /อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม/ });
    expect(row.textContent).toContain("▾");

    await user.click(row);
    expect(screen.getByText("ฉบับเต็มกำลังจัดทำ แสดงหัวข้อไว้ก่อน")).toBeTruthy();
    for (const h of ["ข้อมูลที่เก็บและเหตุผล", "ระยะเวลาเก็บข้อมูล", "วิธีขอลบข้อมูล", "ติดต่อทีมงาน"]) {
      expect(screen.getByText(h)).toBeTruthy();
    }
    expect(screen.getAllByText("(รอทีมยืนยันข้อความ)")).toHaveLength(4);
    expect(row.textContent).toContain("▴");

    await user.click(row);
    expect(screen.queryByText("ฉบับเต็มกำลังจัดทำ แสดงหัวข้อไว้ก่อน")).toBeNull();
  });

  it("keeps the button disabled until ticked, then accepts and goes to setup when there is no cycle", async () => {
    const api = createMockApi({ scenario: "fresh", consented: false });
    const spy = vi.spyOn(api, "acceptConsent");
    renderConsent(api);
    const user = userEvent.setup();
    const btn = screen.getByRole("button", { name: START }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await user.click(screen.getByLabelText("ฉันเข้าใจและยินยอม"));
    expect(btn.disabled).toBe(false);
    await user.click(btn);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/setup/income"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("goes to /app instead of setup when there is already an active cycle", async () => {
    const api = createMockApi({ scenario: "default", consented: false });
    renderConsent(api);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("ฉันเข้าใจและยินยอม"));
    await user.click(screen.getByRole("button", { name: START }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
  });

  it("goes to setup when me() fails", async () => {
    const api = createMockApi({ scenario: "fresh", consented: false });
    vi.spyOn(api, "me").mockRejectedValue(new Error("down"));
    renderConsent(api);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("ฉันเข้าใจและยินยอม"));
    await user.click(screen.getByRole("button", { name: START }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/setup/income"));
  });

  it("a double tap sends one request and stays busy after success", async () => {
    const api = createMockApi({ scenario: "fresh", consented: false });
    const spy = vi.spyOn(api, "acceptConsent");
    renderConsent(api);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("ฉันเข้าใจและยินยอม"));
    const btn = screen.getByRole("button", { name: START });
    await user.dblClick(btn);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledTimes(1);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the ApiError message in an alert and lets the user retry", async () => {
    const api = createMockApi({ scenario: "fresh", consented: false });
    const spy = vi.spyOn(api, "acceptConsent").mockRejectedValueOnce(new ApiError(500, "boom", "เซิร์ฟเวอร์ขัดข้อง"));
    renderConsent(api);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("ฉันเข้าใจและยินยอม"));
    await user.click(screen.getByRole("button", { name: START }));
    expect((await screen.findByRole("alert")).textContent).toBe("เซิร์ฟเวอร์ขัดข้อง");
    expect(replace).not.toHaveBeenCalled();

    await waitFor(() => expect((screen.getByRole("button", { name: START }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: START }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/setup/income"));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a generic message for non-ApiError failures", async () => {
    const api = createMockApi({ scenario: "fresh", consented: false });
    vi.spyOn(api, "acceptConsent").mockRejectedValue(new Error("x"));
    renderConsent(api);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("ฉันเข้าใจและยินยอม"));
    await user.click(screen.getByRole("button", { name: START }));
    expect((await screen.findByRole("alert")).textContent).toBe("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
  });

  it("someone who already consented is sent straight to /app and cannot re-accept", async () => {
    const api = createMockApi({ scenario: "default", consented: true });
    const spy = vi.spyOn(api, "acceptConsent");
    renderConsent(api);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not redirect when the consent check fails", async () => {
    const api = createMockApi({ scenario: "fresh", consented: false });
    const check = vi.spyOn(api, "consent").mockRejectedValue(new Error("down"));
    renderConsent(api);
    await waitFor(() => expect(check).toHaveBeenCalled());
    // Await the actual rejection (and the handler that follows), so "no redirect" cannot pass vacuously.
    await check.mock.results[0].value.catch(() => undefined);
    await act(async () => {
      await Promise.resolve();
    });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: START })).toBeTruthy();
  });
});
