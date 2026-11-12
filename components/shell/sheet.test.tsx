// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

afterEach(cleanup);

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        เปิด
      </button>
      <Sheet
        open={open}
        title="หัวเรื่อง"
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <button type="button">ข้างใน</button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    render(<Sheet open={false} onClose={() => {}} title="x">a</Sheet>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a labelled modal dialog", async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole("button", { name: "เปิด" }));
    const dialog = screen.getByRole("dialog", { name: "หัวเรื่อง" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("Esc closes and focus returns to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "เปิด" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("Tab pulled to the opener (focus outside) re-enters the panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "เปิด" });
    await user.click(opener);
    opener.focus();
    await user.tab();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("backdrop click closes, inside click does not", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "เปิด" }));
    await user.click(screen.getByRole("button", { name: "ข้างใน" }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
