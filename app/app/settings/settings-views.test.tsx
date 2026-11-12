// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "@/lib/api-types";
import { CONSENT_STORAGE_KEY } from "@/lib/client/consent-fallback";
import { saveClaimedCode, loadClaimedCode } from "@/lib/client/claimed-code";
import { ApiError } from "@/lib/client/errors";
import { createMockApi } from "@/lib/client/mock";
import { SETUP_DRAFT_KEY } from "@/lib/client/setup-draft";
import type { PorchaiApi, ReminderSettings } from "@/lib/client/types";
import { ApiContext } from "@/lib/client/use-api";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
}));

import {
  SettingsBillsView,
  SettingsCategoriesView,
  SettingsDeleteView,
  SettingsMainView,
  SettingsNotificationsView,
  SettingsPrivacyView,
  SettingsSavingsView,
} from "./settings-views";

const notImpl = () => Promise.reject(new ApiError(501, "not_implemented", "ฟีเจอร์นี้ยังไม่พร้อมใช้งาน"));

function apiWith(over: Partial<PorchaiApi>): PorchaiApi {
  return { ...createMockApi({ scenario: "default" }), ...over };
}

function renderWith(api: PorchaiApi, ui: React.ReactElement) {
  return render(<ApiContext.Provider value={api}>{ui}</ApiContext.Provider>);
}

const BILL: Plan = {
  id: "b1",
  kind: "bill",
  title: "ค่าหอ",
  amount: 40000,
  dueOn: null,
  category: null,
  status: "reserved",
  entryId: null,
  heldThisCycle: true,
  createdAt: "2026-11-01T00:00:00.000Z",
};

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe("H3 main", () => {
  it("shows only the Figma rows and nothing invented", async () => {
    renderWith(apiWith({ planQuota: notImpl }), <SettingsMainView />);
    for (const t of [
      "รอบเงินและวันเงินเข้า",
      "การเตือน",
      "เงินออม · เงินเผื่อ · ค่าจำเป็น",
      "ความเป็นส่วนตัวและข้อมูล",
      "บิลประจำ",
      "หมวดหมู่ของฉัน",
      "ลบข้อมูลของฉัน",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(t) })).toBeTruthy();
    }
    expect(screen.getByText("แพ็กเกจของคุณ")).toBeTruthy();
    expect(screen.queryByText(/แต้ม/)).toBeNull();
    expect(screen.queryByText(/ไม่จำกัด/)).toBeNull();
    expect(screen.getByRole("link", { name: "ดู Plus" })).toBeTruthy();
  });

  it("quota text comes from the server", async () => {
    renderWith(apiWith({ planQuota: async () => ({ used: 1, limit: 4 }) }), <SettingsMainView />);
    expect(await screen.findByText("ฟรี · เก็บไว้ในแผนได้ 4 รายการต่อรอบ")).toBeTruthy();
  });
});

describe("R1 reminders", () => {
  it("not_implemented -> banner, disabled controls, no habits", async () => {
    renderWith(apiWith({ reminderSettings: notImpl }), <SettingsNotificationsView />);
    expect(await screen.findByText(/ยังไม่พร้อมใช้งาน/)).toBeTruthy();
    expect((screen.getByRole("switch", { name: /เตือนรายการประจำ/ }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("เวลาเตือน") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("switch", { name: /หยุดเตือนชั่วคราว/ }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "บันทึก" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/ข้าวเที่ยง/)).toBeNull();
    expect(screen.queryByText(/ค่ารถ/)).toBeNull();
  });

  it("load failure -> error with retry", async () => {
    const reminderSettings = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
      enabled: true,
      time: "12:30",
      pausedUntil: null,
      habits: [],
    } satisfies ReminderSettings);
    renderWith(apiWith({ reminderSettings }), <SettingsNotificationsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByRole("switch", { name: /เตือนรายการประจำ/ })).toBeTruthy();
  });

  it("shows server habits, saves once per double tap and the success note follows the response", async () => {
    const saved: ReminderSettings = { enabled: true, time: "08:15", pausedUntil: null, habits: [] };
    const saveReminderSettings = vi.fn(async () => saved);
    renderWith(
      apiWith({
        reminderSettings: async () => ({
          enabled: false,
          time: "12:30",
          pausedUntil: null,
          habits: [{ id: "h1", label: "กาแฟ", amount: 6000, time: "07:30" }],
        }),
        saveReminderSettings,
      }),
      <SettingsNotificationsView />,
    );
    expect(await screen.findByText("กาแฟ ~60 บาท")).toBeTruthy();
    expect(screen.getByText("ถามตอน 07:30")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: /เตือนรายการประจำ/ }));
    const time = screen.getByLabelText("เวลาเตือน");
    await user.clear(time);
    await user.type(time, "08:15");
    expect(screen.queryByText("บันทึกการตั้งค่าแล้ว")).toBeNull();
    await user.dblClick(screen.getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("บันทึกการตั้งค่าแล้ว")).toBeTruthy();
    expect(saveReminderSettings).toHaveBeenCalledTimes(1);
    expect(saveReminderSettings).toHaveBeenCalledWith({ enabled: true, time: "08:15", pausedUntil: null });
  });

  it("save not_implemented -> ยังไม่พร้อมใช้งาน and no success note", async () => {
    renderWith(
      apiWith({
        reminderSettings: async () => ({ enabled: true, time: "12:30", pausedUntil: null, habits: [] }),
        saveReminderSettings: notImpl,
      }),
      <SettingsNotificationsView />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    expect(screen.queryByText("บันทึกการตั้งค่าแล้ว")).toBeNull();
  });
});

describe("H5 privacy", () => {
  it("shows the static design text", () => {
    renderWith(apiWith({}), <SettingsPrivacyView />);
    expect(screen.getByText("พอใช้เก็บข้อมูลเท่าที่จำเป็น")).toBeTruthy();
    expect(screen.getByText(/ไม่เชื่อมบัญชีธนาคาร ไม่ขอสลิป/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "เข้าใจแล้ว" })).toBeTruthy();
  });
});

describe("H6 delete everything", () => {
  function seedLocal() {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: "v", acceptedAt: "x" }));
    window.localStorage.setItem(SETUP_DRAFT_KEY, "{}");
    saveClaimedCode("p1", { code: "PC-AAAA", expiresAt: "x" });
  }

  async function confirm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "ลบข้อมูลทั้งหมด" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "ยืนยันลบ" }));
  }

  it("shows the design wording", () => {
    renderWith(apiWith({}), <SettingsDeleteView />);
    expect(screen.getByText("ลบแล้วกู้คืนไม่ได้")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ลบข้อมูลทั้งหมด" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "ยกเลิก" })).toBeTruthy();
  });

  it("not_implemented -> ยังไม่พร้อมใช้งาน, nothing cleared locally, no success, no redirect", async () => {
    seedLocal();
    renderWith(apiWith({ deleteMyData: notImpl }), <SettingsDeleteView />);
    const user = userEvent.setup();
    await confirm(user);
    expect(await screen.findByText("ยังไม่พร้อมใช้งาน")).toBeTruthy();
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(SETUP_DRAFT_KEY)).not.toBeNull();
    expect(loadClaimedCode("p1")).not.toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/ลบแล้ว(?!กู้)/)).toBeNull();
  });

  it("success -> calls once, clears local keys, redirects to consent", async () => {
    seedLocal();
    const deleteMyData = vi.fn(async () => {});
    renderWith(apiWith({ deleteMyData }), <SettingsDeleteView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "ลบข้อมูลทั้งหมด" }));
    const dialog = await screen.findByRole("dialog");
    await user.dblClick(within(dialog).getByRole("button", { name: "ยืนยันลบ" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/consent"));
    expect(deleteMyData).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SETUP_DRAFT_KEY)).toBeNull();
    expect(loadClaimedCode("p1")).toBeNull();
  });
});

describe("H7 bills", () => {
  const plansOf = (plans: Plan[]) => async () => ({ plans });

  it("lists only real bills (not purchases) and has no total computed on screen", async () => {
    const purchase: Plan = { ...BILL, id: "x", kind: "purchase", title: "รองเท้า" };
    renderWith(apiWith({ plans: plansOf([BILL, purchase]) }), <SettingsBillsView />);
    expect(await screen.findByText("ค่าหอ")).toBeTruthy();
    expect(screen.getByText("400 บาท")).toBeTruthy();
    expect(screen.queryByText("รองเท้า")).toBeNull();
    expect(screen.queryByText(/รวมบิล/)).toBeNull();
  });

  it("add: a double tap makes one addPlan call (kind bill) and reloads", async () => {
    const addPlan = vi.fn<PorchaiApi["addPlan"]>(async () => ({ plan: BILL }) as never);
    const plans = vi.fn().mockResolvedValueOnce({ plans: [] }).mockResolvedValue({ plans: [BILL] });
    renderWith(apiWith({ plans, addPlan }), <SettingsBillsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ เพิ่มบิล" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("ชื่อบิล"), "ค่าหอ");
    await user.type(within(dialog).getByLabelText("จำนวนเงิน (บาท)"), "400");
    await user.dblClick(within(dialog).getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(addPlan).toHaveBeenCalledTimes(1));
    expect(addPlan.mock.calls[0][0]).toMatchObject({ kind: "bill", title: "ค่าหอ", amount: 40000 });
    expect(await screen.findByText("ค่าหอ")).toBeTruthy();
  });

  it("edit -> ยังไม่พร้อมใช้งาน and calls nothing", async () => {
    const addPlan = vi.fn();
    const planAction = vi.fn();
    renderWith(apiWith({ plans: plansOf([BILL]), addPlan, planAction }), <SettingsBillsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "แก้ไข ค่าหอ" }));
    expect(await screen.findByText(/ยังไม่พร้อมใช้งาน/)).toBeTruthy();
    expect(addPlan).not.toHaveBeenCalled();
    expect(planAction).not.toHaveBeenCalled();
  });

  it("remove goes through a confirm and planAction(id, 'cancel')", async () => {
    const planAction = vi.fn(async () => ({}) as never);
    renderWith(apiWith({ plans: plansOf([BILL]), planAction }), <SettingsBillsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ลบ ค่าหอ" }));
    expect(planAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.dblClick(within(dialog).getByRole("button", { name: "ลบบิล" }));
    await waitFor(() => expect(planAction).toHaveBeenCalledTimes(1));
    expect(planAction).toHaveBeenCalledWith("b1", "cancel");
  });

  it("load failure -> error with retry", async () => {
    const plans = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ plans: [BILL] });
    renderWith(apiWith({ plans }), <SettingsBillsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ลองใหม่" }));
    expect(await screen.findByText("ค่าหอ")).toBeTruthy();
  });
});

describe("H8 savings / buffer / essentials", () => {
  it("saves essentials through setEssentials as one daily total (food, transport 0) once", async () => {
    const base = createMockApi({ scenario: "default" });
    const setEssentials = vi.fn((req) => base.setEssentials(req));
    renderWith(apiWith({ setEssentials }), <SettingsSavingsView />);
    const user = userEvent.setup();
    const field = await screen.findByLabelText("ยอดต่อวัน (บาท)");
    await user.clear(field);
    await user.type(field, "70");
    await user.dblClick(screen.getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("บันทึกค่าจำเป็นต่อวันแล้ว")).toBeTruthy();
    expect(setEssentials).toHaveBeenCalledTimes(1);
    expect(setEssentials).toHaveBeenCalledWith({ food: 7000, transport: 0 });
  });

  it("savings and buffer adjustments say ยังไม่พร้อมใช้งาน", async () => {
    renderWith(apiWith({}), <SettingsSavingsView />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "ปรับเป้าออม" }));
    expect(await screen.findByText(/ปรับเป้าออมยังใช้ไม่ได้/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ปรับเงินเผื่อ" }));
    expect(await screen.findByText(/ปรับเงินเผื่อยังใช้ไม่ได้/)).toBeTruthy();
  });

  it("an invalid essentials amount is not sent", async () => {
    const setEssentials = vi.fn();
    renderWith(apiWith({ setEssentials }), <SettingsSavingsView />);
    const user = userEvent.setup();
    const field = await screen.findByLabelText("ยอดต่อวัน (บาท)");
    await user.clear(field);
    await user.type(field, "abc");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(setEssentials).not.toHaveBeenCalled();
    expect(screen.getByText("ใส่เป็นตัวเลขเท่านั้น เช่น 400 หรือ 1,250.50")).toBeTruthy();
  });
});

describe("H4 categories", () => {
  it("shows the four real categories, read-only, and persists nothing", async () => {
    renderWith(apiWith({}), <SettingsCategoriesView />);
    for (const t of ["อาหารและเครื่องดื่ม", "เดินทาง", "ของใช้และเรียน", "อื่น ๆ"]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    expect(screen.getAllByRole("button", { name: /^แก้ไข / })).toHaveLength(4);
    expect(screen.queryByText("เรียน")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+ สร้างหมวดใหม่" }));
    expect(await screen.findByText(/สร้างหมวดหมู่ยังใช้ไม่ได้/)).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: /^แก้ไข / })[0]);
    expect(await screen.findByText(/แก้ไขหมวดหมู่ยังใช้ไม่ได้/)).toBeTruthy();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(screen.getAllByRole("button", { name: /^แก้ไข / })).toHaveLength(4);
  });
});
