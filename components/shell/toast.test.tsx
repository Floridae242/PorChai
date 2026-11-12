// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

function Trigger({ mascot }: { mascot?: "reward" }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show("บันทึกแล้ว", mascot ? { mascot } : undefined)}>
      go
    </button>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast", () => {
  it("shows text then auto-hides after 3000 ms", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    // live region is mounted up front so assistive tech announces the inserted text
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("data-clarity-mask")).toBe("true");
    expect(region.textContent).toBe("");
    act(() => screen.getByRole("button", { name: "go" }).click());
    expect(region.textContent).toContain("บันทึกแล้ว");
    act(() => vi.advanceTimersByTime(2999));
    expect(region.textContent).toContain("บันทึกแล้ว");
    act(() => vi.advanceTimersByTime(2));
    expect(region.textContent).toBe("");
  });

  it("renders a 32px mascot when given", () => {
    const { container } = render(
      <ToastProvider>
        <Trigger mascot="reward" />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "go" }).click());
    expect(container.ownerDocument.querySelector("img")?.getAttribute("width")).toBe("32");
  });
});
