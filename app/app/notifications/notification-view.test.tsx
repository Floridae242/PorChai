// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { createMockApi } from "@/lib/client/mock";
import { ApiContext } from "@/lib/client/use-api";
import { NotificationView } from "./notification-view";
afterEach(cleanup);
it("starts opted out and saves only explicitly selected summary preferences", async () => {
  const api = createMockApi({ consented: true }),
    save = vi.spyOn(api, "saveNotificationPreferences");
  render(
    <ApiContext.Provider value={api}>
      <NotificationView />
    </ApiContext.Provider>,
  );
  const toggle = await screen.findByRole("checkbox", { name: /สรุปรายวัน/ });
  expect((toggle as HTMLInputElement).checked).toBe(false);
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแจ้งเตือน" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      daily: true,
      monthly: false,
      budget: false,
      time: "20:00",
    }),
  );
  await screen.findByText(/การส่งจริงขึ้นอยู่กับระบบตั้งเวลาของเซิร์ฟเวอร์/);
});
