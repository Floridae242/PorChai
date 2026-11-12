// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MockBadge } from "./mock-badge";

afterEach(cleanup);

describe("MockBadge", () => {
  it("shows in mock mode", () => {
    render(<MockBadge mode="mock" />);
    expect(screen.getByText("ข้อมูลตัวอย่าง")).toBeTruthy();
  });
  it("renders nothing in live mode", () => {
    const { container } = render(<MockBadge mode="live" />);
    expect(container.firstChild).toBeNull();
  });
});
