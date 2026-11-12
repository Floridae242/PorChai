// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { flexExamples } from "@/lib/line/flex-examples";
import { FlexPreview } from "./preview";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("previews actual receipt data without executing the card's production action", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<FlexPreview examples={flexExamples()} />);
  fireEvent.click(screen.getByRole("tab", { name: "จดสำเร็จ" }));
  expect(screen.getByRole("tabpanel").textContent).toContain("−฿45");
  fireEvent.click(screen.getByRole("button", { name: /แก้ไข \/ ลบรายการ/ }));
  expect(screen.getByRole("status").textContent).toContain("ลิงก์ที่จะเปิดใน LINE");
  expect(fetcher).not.toHaveBeenCalled();
});

it("copies only the Flex contents used by the Simulator", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const examples = flexExamples();
  render(<FlexPreview examples={examples} />);
  fireEvent.click(screen.getByRole("button", { name: "คัดลอก Flex JSON" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "คัดลอก contents JSON แล้ว",
    ),
  );
  expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(
    examples[0].message.contents,
  );
  expect(JSON.parse(writeText.mock.calls[0][0]).type).toBe("carousel");
});

it("reports clipboard failure and supports keyboard tab selection", async () => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  render(<FlexPreview examples={flexExamples()} />);
  fireEvent.keyDown(screen.getByRole("tab", { name: "ต้อนรับ" }), {
    key: "ArrowRight",
  });
  expect(
    screen.getByRole("tab", { name: "จดสำเร็จ" }).getAttribute("aria-selected"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "คัดลอก Flex JSON" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("คัดลอกอัตโนมัติไม่ได้"),
  );
});
