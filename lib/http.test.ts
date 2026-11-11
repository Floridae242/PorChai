import { describe, expect, it, vi } from "vitest";
import { HttpError, errorResponse } from "./http";

describe("errorResponse", () => {
  it("maps HttpError to its status and code", async () => {
    const res = errorResponse(new HttpError(401, "unauthorized", "no"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "no" } });
  });

  it("maps anything else to a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal", message: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" },
    });
  });
});
