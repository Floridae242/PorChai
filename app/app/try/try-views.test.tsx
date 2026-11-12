// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulateResponse } from "@/lib/api-types";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import { loadTryDraft, saveTryDraft } from "@/lib/client/try-draft";
import type { PorchaiApi } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

const push = vi.fn();
const replace = vi.fn();
let currentSearch = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  useParams: () => ({}),
}));

import { TryDecideView, TryInputView, TryResultView, TrySavedView } from "./try-views";

const mk = () => createMockApi({ scenario: "default" });
const SHOES = { title: "รองเท้า", amount: 48000, dueOn: null };

function renderWith(api: PorchaiApi, ui: React.ReactElement) {
  return render(<ApiContext.Provider value={api}>{ui}</ApiContext.Provider>);
}

const okBudget = (dailyBudget: number) =>
  ({
    kind: "ok",
    usable: 0,
    dailyBudget,
    todayRemaining: dailyBudget,
    daysLeft: 12,
    spare: 1,
    maxPurchase: 60000,
    essentialShortPerDay: 0,
  }) as const;

const checks = (over: Partial<NonNullable<SimulateResponse["checks"]>> = {}) => ({
  bills: 60000,
  billsCovered: true,
  essentialPerDay: 7000,
  essentialsCovered: true,
  savings: 24000,
  emergencyBuffer: 12000,
  otherPlans: 0,
  ...over,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  currentSearch = "";
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe("try-draft", () => {
  it("has no default, round-trips, clears and rejects tampered data", () => {
    expect(loadTryDraft()).toBeNull();
    saveTryDraft(SHOES);
    expect(loadTryDraft()).toEqual(SHOES);
    window.sessionStorage.setItem("porchai.try_item.v1", JSON.stringify({ ...SHOES, amount: -1 }));
    expect(loadTryDraft()).toBeNull();
    window.sessionStorage.setItem("porchai.try_item.v1", "{oops");
    expect(loadTryDraft()).toBeNull();
  });
});

describe("TryInputView (C1)", () => {
  it("starts empty with no sample chips and no default amount", () => {
    renderWith(mk(), <TryInputView />);
    expect((screen.getByLabelText("ราคา (บาท)") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText(/ตัวอย่างยอดฮิต/)).toBeNull();
    expect(screen.queryByText(/ลองล่าสุด/)).toBeNull();
    expect(screen.queryByRole("button", { name: /รองเท้า|หูฟัง|หมูกระทะ/ })).toBeNull();
  });

  it("C1e: an empty price shows a validation message and does not navigate", async () => {
    renderWith(mk(), <TryInputView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "ดูผลกระทบต่องบ" }));
    expect(screen.getByText("ใส่ราคาของที่จะซื้อก่อน")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(loadTryDraft()).toBeNull();
  });

  it("C1f: each invalid price gets its own Thai reason", async () => {
    renderWith(mk(), <TryInputView />);
    const user = userEvent.setup();
    const price = screen.getByLabelText("ราคา (บาท)");
    const submit = () => user.click(screen.getByRole("button", { name: "ดูผลกระทบต่องบ" }));
    for (const [text, message] of [
      ["abc", "ใส่เป็นตัวเลข เช่น 480"],
      ["0", "ใส่ราคามากกว่า 0"],
      ["-5", "ใส่ราคามากกว่า 0"],
      ["1.234", "ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง"],
      ["99999999999999999999", "ราคาสูงเกินไป ตรวจตัวเลขอีกครั้ง"],
    ] as const) {
      await user.clear(price);
      await user.type(price, text);
      await submit();
      expect(screen.getByText(message)).toBeTruthy();
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("a valid price saves the draft in satang and goes to the result", async () => {
    renderWith(mk(), <TryInputView />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("ราคา (บาท)"), "480");
    await user.click(screen.getByRole("button", { name: "ดูผลกระทบต่องบ" }));
    expect(loadTryDraft()).toEqual({ title: "ของที่อยากซื้อ", amount: 48000, dueOn: null });
    expect(push).toHaveBeenCalledWith("/app/try/result");
  });
});

describe("TryResultView (C2) — every verdict", () => {
  beforeEach(() => saveTryDraft({ title: "หูฟัง", amount: 70000, dueOn: null }));

  it("ok: after and before daily budgets, toggle cards use aria-pressed", async () => {
    const api = mk();
    vi.spyOn(api, "simulate").mockResolvedValue({
      basis: "b",
      verdict: "ok",
      needs: [],
      before: okBudget(12000),
      after: okBudget(8000),
      overLimitBy: 0,
      countsThisCycle: true,
      checks: checks(),
    });
    renderWith(api, <TryResultView />);
    expect(await screen.findByText("80")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.queryByText(/เกินวงเงิน/)).toBeNull();
    const buy = screen.getByRole("button", { name: /ถ้าซื้อ หูฟัง/ });
    const skip = screen.getByRole("button", { name: /ถ้ายังไม่ซื้อ/ });
    expect(buy.getAttribute("aria-pressed")).toBe("true");
    expect(skip.getAttribute("aria-pressed")).toBe("false");
    await userEvent.setup().click(skip);
    expect(skip.getAttribute("aria-pressed")).toBe("true");
    expect(buy.getAttribute("aria-pressed")).toBe("false");
  });

  it("essentials_short: shows the server's overLimitBy and essentialShortPerDay, computes nothing", async () => {
    const api = mk();
    vi.spyOn(api, "simulate").mockResolvedValue({
      basis: "b",
      verdict: "essentials_short",
      needs: [],
      before: okBudget(12000),
      after: { ...okBudget(6100), essentialShortPerDay: 900 },
      overLimitBy: 12345,
      countsThisCycle: true,
      checks: checks({ essentialsCovered: false }),
    });
    renderWith(api, <TryResultView />);
    expect(await screen.findByText(/เกินวงเงินที่ซื้อได้โดยไม่กระทบค่าจำเป็นไป 123\.45 บาท/)).toBeTruthy();
    expect(screen.getByText(/ขาดวันละ 9 บาท/)).toBeTruthy();
    expect(screen.getByText("61")).toBeTruthy();
  });

  it("shortfall: shows after.shortfall and no daily budget for 'after'", async () => {
    const api = mk();
    vi.spyOn(api, "simulate").mockResolvedValue({
      basis: "b",
      verdict: "shortfall",
      needs: [],
      before: okBudget(12000),
      after: { kind: "shortfall", usable: -30000, shortfall: 30000, daysLeft: 12 },
      overLimitBy: null,
      countsThisCycle: true,
      checks: null,
    });
    renderWith(api, <TryResultView />);
    expect((await screen.findAllByText(/ขาดอีก 300 บาท/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/เกินวงเงิน/)).toBeNull();
    // only the "ถ้ายังไม่ซื้อ" card has a daily budget number
    expect(screen.getAllByText("บาท/วัน")).toHaveLength(1);
  });

  it("ask / essentials: inline form, value sent as essentials on the NEXT simulate, never a blank comparison", async () => {
    const api = mk();
    const simulate = vi
      .spyOn(api, "simulate")
      .mockResolvedValueOnce({
        basis: "b",
        verdict: "ask",
        needs: ["essentials"],
        before: null,
        after: null,
        overLimitBy: null,
        countsThisCycle: true,
        checks: null,
      })
      .mockResolvedValueOnce({
        basis: "b",
        verdict: "ok",
        needs: [],
        before: okBudget(12000),
        after: okBudget(6100),
        overLimitBy: 0,
        countsThisCycle: true,
        checks: checks(),
      });
    renderWith(api, <TryResultView />);
    const user = userEvent.setup();
    const field = await screen.findByLabelText("ค่าจำเป็นต่อวัน (บาท)");
    expect(screen.queryByText("บาท/วัน")).toBeNull();

    await user.click(screen.getByRole("button", { name: "ลองคำนวณอีกครั้ง" }));
    expect(screen.getByText("ใส่ค่าจำเป็นต่อวันก่อน (ถ้าไม่มีเลยให้ใส่ 0)")).toBeTruthy();
    expect(simulate).toHaveBeenCalledTimes(1);

    await user.type(field, "70");
    await user.click(screen.getByRole("button", { name: "ลองคำนวณอีกครั้ง" }));
    expect(await screen.findByText("61")).toBeTruthy();
    expect(simulate).toHaveBeenCalledTimes(2);
    expect(simulate.mock.calls[1][0]).toEqual({
      amount: 70000,
      dueOn: null,
      essentials: { food: 7000, transport: 0 },
    });
  });

  it("ask / essentials: 'จำไว้' calls setEssentials once (double tap) with the same total", async () => {
    const api = mk();
    vi.spyOn(api, "simulate").mockResolvedValue({
      basis: "b",
      verdict: "ask",
      needs: ["essentials"],
      before: null,
      after: null,
      overLimitBy: null,
      countsThisCycle: true,
      checks: null,
    });
    const gate = deferred<{ summary: Awaited<ReturnType<PorchaiApi["summary"]>> }>();
    const set = vi.spyOn(api, "setEssentials").mockImplementation(() => gate.promise);
    renderWith(api, <TryResultView />);
    fireEvent.change(await screen.findByLabelText("ค่าจำเป็นต่อวัน (บาท)"), { target: { value: "70" } });
    const remember = screen.getByRole("button", { name: "จำไว้" });
    fireEvent.click(remember);
    fireEvent.click(remember);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ food: 7000, transport: 0 });
    await act(async () => gate.resolve({ summary: await api.summary() }));
  });

  it("ask / payday: says payday passed and links to /app/cycle/new", async () => {
    const api = mk();
    vi.spyOn(api, "simulate").mockResolvedValue({
      basis: "b",
      verdict: "ask",
      needs: ["payday"],
      before: null,
      after: null,
      overLimitBy: null,
      countsThisCycle: true,
      checks: null,
    });
    renderWith(api, <TryResultView />);
    expect(await screen.findByText(/ถึงวันเงินเข้าแล้ว/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "ตั้งรอบเงินใหม่" });
    expect(link.getAttribute("href")).toBe("/app/cycle/new");
    expect(screen.queryByLabelText("ค่าจำเป็นต่อวัน (บาท)")).toBeNull();
  });

  it("failure: error banner with ลองใหม่, retry works", async () => {
    const api = mk();
    const simulate = vi
      .spyOn(api, "simulate")
      .mockRejectedValueOnce(new ApiError(500, "internal", "ระบบผิดพลาด"));
    renderWith(api, <TryResultView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ระบบผิดพลาด");
    simulate.mockResolvedValue({
      basis: "b",
      verdict: "ok",
      needs: [],
      before: okBudget(12000),
      after: okBudget(6100),
      overLimitBy: 0,
      countsThisCycle: true,
      checks: checks(),
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("61")).toBeTruthy();
  });

  it("no draft and no query: redirects to /app/try", async () => {
    window.sessionStorage.clear();
    renderWith(mk(), <TryResultView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/try"));
  });

  it("skip choice clears the draft", async () => {
    const api = mk();
    renderWith(api, <TryResultView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /ถ้ายังไม่ซื้อ/ }));
    await user.click(screen.getByRole("button", { name: "ไม่ซื้อ · กลับหน้าสรุป" }));
    expect(loadTryDraft()).toBeNull();
    expect(push).toHaveBeenCalledWith("/app");
  });
});

describe("TryDecideView (C3)", () => {
  beforeEach(() => saveTryDraft(SHOES));

  it("no draft: redirects to /app/try", async () => {
    window.sessionStorage.clear();
    renderWith(mk(), <TryDecideView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/try"));
  });

  it("allows keeping in plan and confirming real payment without any quota banner", async () => {
    const api = mk();
    const addEntry = vi.spyOn(api, "addEntry");
    renderWith(api, <TryDecideView />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "เก็บไว้ในแผน" });
    expect(screen.queryByText(/ใช้สิทธิ์แผนฟรี/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Plus/ })).toBeNull();

    // stacked, ยกเลิก right under the confirm button
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons.indexOf("ยกเลิก")).toBe(buttons.length - 1);

    await user.click(screen.getByRole("radio", { name: /^ยืนยันจ่ายจริง/ }));
    await user.click(screen.getByRole("button", { name: "ยืนยันจ่ายจริง" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/record/done?mode=normal"));
    expect(addEntry).toHaveBeenCalledTimes(1);
    expect(addEntry.mock.calls[0][0]).toEqual({ amount: 48000, category: "other", note: "รองเท้า" });
  });

  it.each([
    ["เก็บไว้ในแผน", "addPlan"],
    ["ยืนยันจ่ายจริง", "addEntry"],
    ["เลื่อนไปรอบหน้า", "addPlan"],
  ] as const)("double tap on %s sends one call", async (label, method) => {
    const api = mk();
    const gate = deferred<never>();
    const spy = vi.spyOn(api, method).mockImplementation(() => gate.promise as never);
    renderWith(api, <TryDecideView />);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "เก็บไว้ในแผน" });
    if (label !== "เก็บไว้ในแผน") await user.click(screen.getByRole("radio", { name: new RegExp(`^${label}`) }));
    const btn = screen.getByRole("button", { name: label });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => gate.reject(new ApiError(500, "x", "ล้มเหลว")));
  });

  it("same-payload retry after failure reuses the key; another action gets a new key", async () => {
    const api = mk();
    const addPlan = vi.spyOn(api, "addPlan").mockRejectedValue(new ApiError(0, "network", "เน็ตหลุด ลองใหม่"));
    renderWith(api, <TryDecideView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "เก็บไว้ในแผน" }));
    expect((await screen.findByRole("alert")).textContent).toContain("เน็ตหลุด ลองใหม่");
    await user.click(screen.getByRole("button", { name: "เก็บไว้ในแผน" }));
    await waitFor(() => expect(addPlan).toHaveBeenCalledTimes(2));
    expect(addPlan.mock.calls[1][1]).toBe(addPlan.mock.calls[0][1]);
    await screen.findByRole("alert");

    await user.click(screen.getByRole("radio", { name: /^เลื่อนไปรอบหน้า/ }));
    await user.click(screen.getByRole("button", { name: "เลื่อนไปรอบหน้า" }));
    await waitFor(() => expect(addPlan).toHaveBeenCalledTimes(3));
    expect(addPlan.mock.calls[2][1]).not.toBe(addPlan.mock.calls[0][1]);
    expect(addPlan.mock.calls[2][0]).toMatchObject({ status: "postponed" });
    // the data is still on screen after failures
    expect(screen.getByText("480 บาท")).toBeTruthy();
  });

  it("keep success: clears the draft and goes to saved with the plan id; busy is never reset", async () => {
    const api = mk();
    const addPlan = vi.spyOn(api, "addPlan");
    renderWith(api, <TryDecideView />);
    const user = userEvent.setup();
    const btn = await screen.findByRole("button", { name: "เก็บไว้ในแผน" });
    await user.click(btn);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const res = await addPlan.mock.results[0].value;
    expect(replace).toHaveBeenCalledWith(`/app/try/saved?plan=${res.plan.id}`);
    expect(loadTryDraft()).toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(addPlan).toHaveBeenCalledTimes(1);
  });

  it("postpone success goes to the pending tab and clears the draft", async () => {
    const api = mk();
    renderWith(api, <TryDecideView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: /^เลื่อนไปรอบหน้า/ }));
    await user.click(screen.getByRole("button", { name: "เลื่อนไปรอบหน้า" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/plan?tab=pending"));
    expect(loadTryDraft()).toBeNull();
  });

  it("ยกเลิก clears the draft and leaves without calling anything", async () => {
    const api = mk();
    const addPlan = vi.spyOn(api, "addPlan");
    renderWith(api, <TryDecideView />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "ยกเลิก" }));
    expect(loadTryDraft()).toBeNull();
    expect(replace).toHaveBeenCalledWith("/app");
    expect(addPlan).not.toHaveBeenCalled();
  });
});

describe("TrySavedView (C4)", () => {
  it("looks up the exact plan id; a missing id says so without falling back", async () => {
    const api = mk();
    const { plan } = await api.addPlan({ title: "รองเท้า", amount: 48000 }, "k-1");
    currentSearch = `plan=${plan.id}`;
    const { unmount } = renderWith(api, <TrySavedView />);
    expect(await screen.findByText(/รองเท้า/)).toBeTruthy();
    // Figma C4: mascot งบโอเค (budgetOk) 72
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/mascot/budgetOk.png");
    expect(img.getAttribute("width")).toBe("72");
    unmount();

    currentSearch = "plan=plan-999";
    renderWith(api, <TrySavedView />);
    expect(await screen.findByText("ไม่พบรายการนี้")).toBeTruthy();
    expect(screen.queryByText(/รองเท้า/)).toBeNull();
  });

  it("no plan param: redirects to /app/try", async () => {
    renderWith(mk(), <TrySavedView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/try"));
  });
});
