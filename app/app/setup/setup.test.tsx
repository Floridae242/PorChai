// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, thaiDate } from "@/lib/calc/time";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import {
  clearSetupDraft,
  createEmptySetupDraft,
  loadSetupDraft,
  saveSetupDraft,
  SETUP_DRAFT_KEY,
  type SetupDraft,
} from "@/lib/client/setup-draft";
import { ApiContext } from "@/lib/client/use-api";
import type { PorchaiApi } from "@/lib/client/types";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

import SetupBalancePage from "./balance/page";
import SetupEssentialsPage from "./essentials/page";
import SetupIncomePage from "./income/page";
import SetupReviewPage from "./review/page";
import SetupSavingsPage from "./savings/page";

const payday = () => addDays(thaiDate(new Date()), 12);

function renderPage(Page: () => React.ReactElement, api: PorchaiApi = createMockApi({ scenario: "fresh", consented: true })) {
  render(
    <ApiContext.Provider value={api}>
      <Page />
    </ApiContext.Provider>,
  );
  return api;
}

// The Figma A4 numbers, entered as data.
function figmaDraft(over: Partial<SetupDraft> = {}): SetupDraft {
  return {
    ...createEmptySetupDraft(),
    incomeSource: "family",
    incomeFrequency: "monthly",
    payday: payday(),
    balance: 240000,
    bills: [
      { id: "b1", title: "ค่าหอ", amount: 40000, status: "unpaid" },
      { id: "b2", title: "ค่าน้ำ", amount: 5000, status: "unpaid" },
      { id: "b3", title: "ค่าไฟ", amount: 15000, status: "unpaid" },
    ],
    savingsMode: "percent",
    savingsPercent: 10,
    emergencyBuffer: 12000,
    essentialPerDay: 7000,
    ...over,
  };
}

beforeEach(() => {
  clearSetupDraft();
  push.mockClear();
  replace.mockClear();
});
afterEach(cleanup);

describe("new user starts empty (no fake defaults)", () => {
  it("empty draft has no numbers, bills or selections", () => {
    const d = createEmptySetupDraft();
    expect(d.balance).toBeNull();
    expect(d.bills).toEqual([]);
    expect(d.payday).toBe("");
    expect(d.savingsMode).toBeNull();
    expect(d.emergencyBuffer).toBeNull();
    expect(d.essentialPerDay).toBeNull();
    expect(d.incomeSource).toBeNull();
    expect(loadSetupDraft()).toEqual(d);
  });

  it("balance page shows an empty field, no bills and no invented totals", async () => {
    renderPage(SetupBalancePage);
    const field = (await screen.findByLabelText("เงินที่มีตอนนี้ (บาท)")) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(screen.queryByText("ค่าหอ")).toBeNull();
    expect(screen.getByText("0 บาท")).toBeTruthy(); // bills total with no bills
  });

  it("income page has nothing pre-selected and no payday", async () => {
    renderPage(SetupIncomePage);
    await screen.findByText("แหล่งเงินหลัก");
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect((screen.getByLabelText("วันเงินเข้าครั้งถัดไป") as HTMLInputElement).value).toBe("");
  });

  it("review (A4) lists what is missing instead of numbers", async () => {
    renderPage(SetupReviewPage);
    expect(await screen.findByText(/ยังไม่ได้กรอก/)).toBeTruthy();
    expect(screen.queryByText("บาท/วัน")).toBeNull();
    expect(screen.queryByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d{3,}/);
  });

  it("review names only the missing parts", async () => {
    saveSetupDraft(figmaDraft({ balance: null, emergencyBuffer: null }));
    renderPage(SetupReviewPage);
    const text = (await screen.findByText(/ยังไม่ได้กรอก/)).textContent ?? "";
    expect(text).toContain("เงินที่มีตอนนี้");
    expect(text).toContain("เงินเผื่อ");
    expect(text).not.toContain("วันเงินเข้า");
  });
});

describe("setup flow with the Figma numbers entered through the UI", () => {
  it("walks all steps and A4 shows 120 บาท/วัน and ซื้อได้ไม่เกิน 600 บาท", async () => {
    const user = userEvent.setup();

    // 1 income
    renderPage(SetupIncomePage);
    await user.click(await screen.findByRole("button", { name: "ทางบ้านส่งให้" }));
    await user.click(screen.getByRole("button", { name: "รายเดือน" }));
    fireEvent.change(screen.getByLabelText("วันเงินเข้าครั้งถัดไป"), { target: { value: payday() } });
    await user.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(push).toHaveBeenLastCalledWith("/app/setup/balance");
    cleanup();

    // 2 balance + bills
    renderPage(SetupBalancePage);
    await user.type(await screen.findByLabelText("เงินที่มีตอนนี้ (บาท)"), "2400");
    for (const [name, amount] of [
      ["ค่าหอ", "400"],
      ["ค่าน้ำ", "50"],
      ["ค่าไฟ", "150"],
    ]) {
      await user.click(screen.getByRole("button", { name: "+ เพิ่มบิล" }));
      await user.type(screen.getByLabelText("ชื่อบิล"), name);
      await user.type(screen.getByLabelText("จำนวนเงิน (บาท)"), amount);
      await user.click(screen.getByRole("button", { name: "บันทึก" }));
    }
    expect(screen.getByText("600 บาท")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(push).toHaveBeenLastCalledWith("/app/setup/savings");
    cleanup();

    // 3 savings + buffer
    renderPage(SetupSavingsPage);
    await user.click(await screen.findByRole("button", { name: /^10%/ }));
    await user.click(screen.getByRole("button", { name: "120 บาท" }));
    await user.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(push).toHaveBeenLastCalledWith("/app/setup/essentials");
    cleanup();

    // 4 essentials
    renderPage(SetupEssentialsPage);
    await user.type(await screen.findByLabelText("ยอดต่อวัน (บาท)"), "70");
    await user.click(screen.getByRole("button", { name: "ดูสรุปแผน" }));
    expect(push).toHaveBeenLastCalledWith("/app/setup/review");
    cleanup();

    // 5 review
    renderPage(SetupReviewPage);
    expect(await screen.findByText("120")).toBeTruthy();
    expect(screen.getByText("บาท/วัน")).toBeTruthy();
    expect(screen.getByText("ซื้อได้ไม่เกิน 600 บาท")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "กลับไปแก้ไข" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ออกก่อน" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("ใช้แผนนี้");
  });

  it("marking ค่าหอ as จ่ายแยก changes the bills total and the daily budget to 153", async () => {
    saveSetupDraft(figmaDraft());
    const user = userEvent.setup();
    renderPage(SetupBalancePage);
    expect(await screen.findByText("600 บาท")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "แก้ไข ค่าหอ" }));
    await user.click(screen.getByRole("button", { name: "จ่ายแยก" }));
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(screen.getByText("200 บาท")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ถัดไป" }));
    cleanup();
    renderPage(SetupReviewPage);
    expect(await screen.findByText("153")).toBeTruthy();
  });

  it("A5a: bills larger than the money shows the shortfall with แก้ตัวเลข / เลือกบิลที่เลื่อนได้", async () => {
    saveSetupDraft(
      figmaDraft({
        balance: 50000,
        savingsMode: "none",
        savingsPercent: null,
        emergencyBuffer: 0,
        bills: [
          { id: "1", title: "ค่าหอ", amount: 50000, status: "unpaid" },
          { id: "2", title: "ค่าน้ำ", amount: 5000, status: "unpaid" },
          { id: "3", title: "ค่าไฟ", amount: 25000, status: "unpaid" },
        ],
      }),
    );
    renderPage(SetupReviewPage);
    expect(await screen.findByText("ยังขาดอีก 300 บาท")).toBeTruthy();
    expect(screen.getByText("เงินที่มียังไม่ครอบคลุมบิลก่อนวันเงินเข้า")).toBeTruthy();
    expect(screen.getByRole("button", { name: "แก้ตัวเลข" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "เลือกบิลที่เลื่อนได้" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" })).toBeNull();
    expect(screen.queryByRole("button", { name: "เริ่มใช้ต่อไป" })).toBeNull();
  });

  it("A5b: under 50 บาท/วัน shows the warning with เริ่มใช้ต่อไป / แก้ตัวเลข", async () => {
    saveSetupDraft(figmaDraft({ balance: 70000, bills: [{ id: "1", title: "ค่าหอ", amount: 60000, status: "unpaid" }], savingsMode: "none", savingsPercent: null, emergencyBuffer: 0 }));
    renderPage(SetupReviewPage);
    expect(await screen.findByText("ตึงมาก: เหลือต่ำกว่า 50 บาทต่อวัน")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByRole("button", { name: "เริ่มใช้ต่อไป" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "แก้ตัวเลข" })).toBeTruthy();
  });

  it("a payday in the past (stale draft) sends the user back to fix it instead of showing numbers", async () => {
    saveSetupDraft(figmaDraft({ payday: addDays(thaiDate(new Date()), -2) }));
    renderPage(SetupReviewPage);
    expect(await screen.findByText("วันเงินเข้าผ่านไปแล้ว กรุณาเลือกวันเงินเข้าใหม่")).toBeTruthy();
    expect(screen.queryByText("บาท/วัน")).toBeNull();
  });
});

describe("validation messages", () => {
  it("balance field uses the parse reason codes in Thai", async () => {
    const user = userEvent.setup();
    renderPage(SetupBalancePage);
    const field = await screen.findByLabelText("เงินที่มีตอนนี้ (บาท)");
    const next = screen.getByRole("button", { name: "ถัดไป" });
    await user.click(next);
    expect(screen.getByText("กรุณากรอกจำนวนเงิน")).toBeTruthy();
    await user.type(field, "abc");
    await user.click(next);
    expect(screen.getByText("ใส่เป็นตัวเลขเท่านั้น เช่น 400 หรือ 1,250.50")).toBeTruthy();
    await user.clear(field);
    await user.type(field, "0");
    await user.click(next);
    expect(screen.getByText("ใส่จำนวนเงินมากกว่า 0")).toBeTruthy();
    await user.clear(field);
    await user.type(field, "1.234");
    await user.click(next);
    expect(screen.getByText("ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("bill name error shows under the name field, amount error under the amount field", async () => {
    const user = userEvent.setup();
    renderPage(SetupBalancePage);
    await user.click(await screen.findByRole("button", { name: "+ เพิ่มบิล" }));
    await user.type(screen.getByLabelText("จำนวนเงิน (บาท)"), "100");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    const nameField = screen.getByLabelText("ชื่อบิล");
    expect(nameField.getAttribute("aria-describedby")).toBeTruthy();
    const nameHelper = document.getElementById(nameField.getAttribute("aria-describedby") as string);
    expect(nameHelper?.textContent).toBe("กรุณาใส่ชื่อบิล");
    expect(screen.getByLabelText("จำนวนเงิน (บาท)").getAttribute("aria-describedby")).toBeNull();

    await user.type(nameField, "ค่าเน็ต");
    await user.clear(screen.getByLabelText("จำนวนเงิน (บาท)"));
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    const amountField = screen.getByLabelText("จำนวนเงิน (บาท)");
    const amountHelper = document.getElementById(amountField.getAttribute("aria-describedby") as string);
    expect(amountHelper?.textContent).toBe("กรุณากรอกจำนวนเงิน");
    expect(screen.getByLabelText("ชื่อบิล").getAttribute("aria-describedby")).toBeNull();
  });

  it("savings custom amount text follows the amount when switching to กำหนดเอง", async () => {
    saveSetupDraft(figmaDraft({ savingsMode: "percent", savingsPercent: 10 }));
    const user = userEvent.setup();
    renderPage(SetupSavingsPage);
    await user.click(await screen.findByRole("button", { name: /^10%/ }));
    const custom = screen.getAllByRole("button", { name: "กำหนดเอง" })[0];
    await user.click(custom);
    expect((screen.getByLabelText("จำนวนเงินออม (บาท)") as HTMLInputElement).value).toBe("240");
  });
});

describe("createCycle (A4 submit)", () => {
  async function startReview(api: PorchaiApi) {
    saveSetupDraft(figmaDraft());
    renderPage(SetupReviewPage, api);
    return screen.findByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" });
  }

  it("double tap sends one request, clears the draft only after success, stays busy", async () => {
    const api = createMockApi({ scenario: "fresh", consented: true });
    const spy = vi.spyOn(api, "createCycle");
    const btn = await startReview(api);
    const user = userEvent.setup();
    expect(window.localStorage.getItem(SETUP_DRAFT_KEY)).not.toBeNull();
    await user.dblClick(btn);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app?toast=saved"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].essentials).toEqual({ food: 7000, transport: 0 });
    expect(window.localStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("409 cycle_exists counts as success and goes to /app", async () => {
    const api = createMockApi({ scenario: "fresh", consented: true });
    vi.spyOn(api, "createCycle").mockRejectedValue(new ApiError(409, "cycle_exists", "มีรอบเงินอยู่แล้ว"));
    const btn = await startReview(api);
    await userEvent.setup().click(btn);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(window.localStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
  });

  it("failure shows the Thai message in an alert, keeps the draft, and retry works", async () => {
    const api = createMockApi({ scenario: "fresh", consented: true });
    const spy = vi.spyOn(api, "createCycle").mockRejectedValueOnce(new ApiError(500, "boom", "เซิร์ฟเวอร์ขัดข้อง"));
    const btn = await startReview(api);
    const user = userEvent.setup();
    await user.click(btn);
    expect((await screen.findByRole("alert")).textContent).toContain("เซิร์ฟเวอร์ขัดข้อง");
    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SETUP_DRAFT_KEY)).not.toBeNull();

    await waitFor(() => expect((screen.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: "ถูกต้อง เริ่มใช้เลย" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app?toast=saved"));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
  });

  it("the exit dialog keeps the draft", async () => {
    saveSetupDraft(figmaDraft());
    const user = userEvent.setup();
    renderPage(SetupReviewPage);
    await user.click(await screen.findByRole("button", { name: "ออกก่อน" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/ทำต่อจากขั้นนี้/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "เก็บร่างแล้วออก" }));
    expect(window.localStorage.getItem(SETUP_DRAFT_KEY)).not.toBeNull();
  });
});
