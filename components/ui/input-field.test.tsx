// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InputField } from "./input-field";

afterEach(cleanup);

describe("InputField", () => {
  it("error state sets aria-invalid and links helper via aria-describedby", () => {
    render(<InputField label="จำนวนเงิน" value="" state="error" helper="กรอกจำนวนเงิน" inputMode="decimal" onChange={() => {}} />);
    const input = screen.getByLabelText("จำนวนเงิน");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    const helper = screen.getByText("กรอกจำนวนเงิน");
    expect(input.getAttribute("aria-describedby")).toBe(helper.id);
    expect(helper.id).not.toBe("");
  });

  it("default state is not invalid and has no describedby without helper", () => {
    render(<InputField label="ชื่อ" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("ชื่อ");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });
});
