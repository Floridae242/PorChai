// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsBillsView } from "./bills-view";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";
import { thaiDate, addDays } from "@/lib/calc/time";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
afterEach(cleanup);
describe("calendar bill flow", () => {
  it("uses selected date, explicit LINE opt-in and confirmation before creating one schedule", async () => {
    const today = thaiDate(new Date()),
      due = addDays(today, 3),
      base = createMockApi({ today, scenario: "midCycle" }),
      create = vi.fn(base.createBillSchedule);
    render(
      <ApiContext.Provider value={{ ...base, createBillSchedule: create }}>
        <SettingsBillsView />
      </ApiContext.Provider>,
    );
    const user = userEvent.setup();
    await screen.findByRole("table");
    if (due.slice(0, 7) !== today.slice(0, 7))
      await user.click(screen.getByRole("button", { name: "เดือนถัดไป" }));
    await user.click(screen.getByRole("button", { name: due }));
    await user.click(screen.getByRole("button", { name: "+ เพิ่มบิล" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("ชื่อบิล"), "ค่าเน็ตทดสอบ");
    await user.type(within(dialog).getByLabelText("จำนวนเงิน (บาท)"), "399.50");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.selectOptions(within(dialog).getByRole("combobox"), "once");
    await user.click(
      within(dialog).getByRole("button", { name: "ตรวจบิลก่อนบันทึก" }),
    );
    expect(create).not.toHaveBeenCalled();
    expect(within(dialog).getByText(new RegExp(due))).toBeTruthy();
    await user.dblClick(
      within(dialog).getByRole("button", { name: "ยืนยันเพิ่มบิล" }),
    );
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toEqual({
      title: "ค่าเน็ตทดสอบ",
      amount: 39950,
      startsOn: due,
      repeat: "once",
      notify: true,
    });
    expect(
      await screen.findByText("เพิ่มบิลแล้ว ยังไม่ได้บันทึกเป็นรายจ่าย"),
    ).toBeTruthy();
  });
  it("stops future recurrence only after a separate confirmation", async () => {
    const today = thaiDate(new Date()),
      base = createMockApi({ today }),
      s = await base.createBillSchedule(
        {
          title: "ค่าหอทดสอบ",
          amount: 300000,
          startsOn: today,
          repeat: "monthly",
          notify: true,
        },
        "fixture",
      ),
      update = vi.fn(base.updateBillSchedule);
    render(
      <ApiContext.Provider value={{ ...base, updateBillSchedule: update }}>
        <SettingsBillsView />
      </ApiContext.Provider>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "หยุดบิล ค่าหอทดสอบ" }),
    );
    expect(update).not.toHaveBeenCalled();
    await userEvent.dblClick(
      within(screen.getByRole("dialog")).getByRole("button", { name: "ลบบิล" }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith(s.id, { stop: true });
  });
});
