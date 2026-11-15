import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
const db = vi.hoisted(() => ({ pointsHistory: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/db/rewards", () => db);

import { HttpError } from "@/lib/http";
import { GET } from "./route";

const req = () => new Request("https://porchai.vercel.app/api/points/history");

beforeEach(() => {
  auth.requireUser.mockReset();
  db.pointsHistory.mockReset();
});

describe("GET /api/points/history", () => {
  it("returns the signed-in user's history, read for that user only", async () => {
    auth.requireUser.mockResolvedValue({ userId: "u1" });
    db.pointsHistory.mockResolvedValue({ items: [{ id: "a", kind: "daily", delta: 1, day: "2026-11-15", rewardName: null }] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: "a", kind: "daily", delta: 1, day: "2026-11-15", rewardName: null }] });
    expect(db.pointsHistory).toHaveBeenCalledWith("u1");
  });

  it("refuses without a verified LINE user and reads nothing", async () => {
    auth.requireUser.mockRejectedValue(new HttpError(401, "unauthorized", "no"));
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(db.pointsHistory).not.toHaveBeenCalled();
  });
});
