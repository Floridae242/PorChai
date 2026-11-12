import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const channelId = "2012545254";
const claims = () => ({ iss: "https://access.line.me", aud: channelId, sub: "Utest", name: "นักศึกษา", exp: Math.floor(Date.now() / 1000) + 600 });
const request = (body: unknown = { idToken: "fake-id-token" }) => new Request("http://localhost/api/line/verify", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", channelId);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("LINE ID token verification", () => {
  it("sends the token and MINI App channel ID to LINE and returns verified identity", async () => {
    fetchMock.mockResolvedValue(Response.json(claims()));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ user: { id: "Utest", name: "นักศึกษา" } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(options.body.get("client_id")).toBe(channelId);
    expect(options.body.get("id_token")).toBe("fake-id-token");
  });
  it("rejects a token rejected by LINE", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "invalid_request" }, { status: 400 }));
    expect((await POST(request())).status).toBe(401);
  });
  it.each([
    { aud: "2012545691" }, { iss: "https://fake.example" }, { exp: 1 }, { sub: "" },
  ])("rejects incorrect verified claims: %j", async override => {
    fetchMock.mockResolvedValue(Response.json({ ...claims(), ...override }));
    expect((await POST(request())).status).toBe(401);
  });
  it.each([{}, { idToken: "" }, { idToken: 123 }, { idToken: "x".repeat(16385) }])("rejects invalid input", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles malformed JSON", async () => {
    expect((await POST(new Request("http://localhost/api/line/verify", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("fails closed when the channel is not configured", async () => {
    vi.stubEnv("LINE_MINIAPP_CHANNEL_ID", "");
    expect((await POST(request())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles upstream failures without exposing details", async () => {
    fetchMock.mockRejectedValue(new Error("private upstream details"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "LINE verification unavailable" });
  });
});
