import { describe, expect, it, vi } from "vitest";
import { verifyMiniAppUser } from "./miniapp-user";

describe("MINI App identity", () => {
  it("sends the ID token and uses only the server verified profile", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ user: { id: "Utest", name: "นักศึกษา" } }));
    expect(await verifyMiniAppUser("fake-token", fetcher)).toEqual({ id: "Utest", name: "นักศึกษา" });
    expect(fetcher).toHaveBeenCalledWith("/api/line/verify", expect.objectContaining({
      method: "POST", body: JSON.stringify({ idToken: "fake-token" }),
    }));
  });
  it("does not request verification without an ID token", async () => {
    const fetcher = vi.fn();
    await expect(verifyMiniAppUser(null, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 503])("does not show authenticated content after status %s", async status => {
    await expect(verifyMiniAppUser("fake-token", vi.fn().mockResolvedValue(new Response(null, { status })))).rejects.toThrow();
  });
  it.each([{}, { user: { id: "", name: null } }, { user: { id: "Utest", name: 7 } }])("rejects malformed verification results", async body => {
    await expect(verifyMiniAppUser("fake-token", vi.fn().mockResolvedValue(Response.json(body)))).rejects.toThrow();
  });
});
