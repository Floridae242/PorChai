// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Chip } from "./chip";

afterEach(cleanup);

function Toggle() {
  const [on, setOn] = useState(false);
  return (
    <Chip selected={on} onClick={() => setOn(!on)}>
      อาหาร
    </Chip>
  );
}

describe("Chip", () => {
  it("toggles aria-pressed", async () => {
    render(<Toggle />);
    const chip = screen.getByRole("button", { name: "อาหาร" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await userEvent.setup().click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });
});
