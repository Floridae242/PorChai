// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";

afterEach(cleanup);

describe("Button", () => {
  it("calls onClick when idle", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>ตกลง</Button>);
    await userEvent.setup().click(screen.getByRole("button", { name: "ตกลง" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("busy blocks repeat onClick and sets aria-busy", async () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        ตกลง
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "ตกลง" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(btn);
    await userEvent.setup().click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Button extras", () => {
  it("is 52px tall (Figma)", () => {
    render(<Button>x</Button>);
    expect(screen.getByRole("button").className).toContain("h-[52px]");
  });
  it("defaults to type=button", () => {
    render(<Button>x</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });
  it("disabled blocks onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        x
      </Button>,
    );
    await userEvent.setup().click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
  it("busy keeps the label and shows a spinner", () => {
    render(<Button busy>ส่ง</Button>);
    const btn = screen.getByRole("button", { name: "ส่ง" });
    expect(btn.querySelector("span[aria-hidden='true']")).not.toBeNull();
  });
});
