// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Mascot } from "./mascot";

afterEach(cleanup);

describe("Mascot", () => {
  it("clamps size to 32-96 and uses empty alt", () => {
    const { container, rerender } = render(<Mascot pose="greeting" size={200} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("width")).toBe("96");
    rerender(<Mascot pose="greeting" size={4} />);
    expect(container.querySelector("img")!.getAttribute("width")).toBe("32");
  });
  it("defaults to 80 and offers webp only when motion is allowed", () => {
    const { container } = render(<Mascot pose="scanReceipt" />);
    expect(container.querySelector("img")!.getAttribute("width")).toBe("80");
    const src = container.querySelector("source")!;
    expect(src.getAttribute("srcset")).toBe("/mascot/scanReceipt.webp");
    expect(src.getAttribute("media")).toBe("(prefers-reduced-motion: no-preference)");
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/mascot/scanReceipt.png");
  });
});
