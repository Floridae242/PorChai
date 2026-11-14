import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "@/app/api/admin/richmenu/route";

// Rich menu setup (โฟรวิว's spec + image public/richmenu.png): run once after deploy. The LINE token
// lives only on Vercel, so this runs there, behind the same secret as the scheduler.

const req = (key = "s3cret", method = "POST") =>
  new Request("https://porchai.vercel.app/api/admin/richmenu", { method, headers: { Authorization: `Bearer ${key}` } });

describe("POST /api/admin/richmenu", () => {
  let calls: { url: string; method: string; body: unknown; type: string | null }[];
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "line-token");
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method ?? "GET", body: init.body, type: new Headers(init.headers).get("content-type") });
        if (url.endsWith("/richmenu/list")) {
          return Response.json({ richmenus: [{ richMenuId: "old-1", name: "PorChai Main Menu v1" }, { richMenuId: "other", name: "someone else's" }] });
        }
        if (url.endsWith("/v2/bot/richmenu") && init.method === "POST") return Response.json({ richMenuId: "new-1" });
        if (url.endsWith("/richmenu.png")) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
        return new Response("{}", { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses without the secret, or when the server has none", async () => {
    expect((await POST(req("wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(req(""))).status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("replaces our old menu, creates it from the spec, uploads the image and makes it everyone's default", async () => {
    const res = await POST(req());
    expect(await res.json()).toEqual({ richMenuId: "new-1", replaced: 1 });
    expect(calls.map((c) => `${c.method} ${c.url.replace(/https:\/\/api(-data)?\.line\.me/, "")}`)).toEqual([
      "GET /v2/bot/richmenu/list",
      "DELETE /v2/bot/richmenu/old-1",
      "POST /v2/bot/richmenu",
      "GET https://porchai.vercel.app/richmenu.png",
      "POST /v2/bot/richmenu/new-1/content",
      "POST /v2/bot/user/all/richmenu/new-1",
    ]);
    const spec = JSON.parse(String(calls[2].body));
    expect(spec).toMatchObject({ size: { width: 2500, height: 1686 }, name: "PorChai Main Menu v1", chatBarText: "เมนูพอใช้" });
    expect(spec.areas.map((a: { action: { label: string } }) => a.action.label)).toEqual([
      "จดรายรับ/จ่าย",
      "ลองก่อนจ่าย",
      "วันนี้ใช้ได้",
      "สิทธิพิเศษ & แต้ม",
      "เปิดแอป",
    ]);
    expect(calls[4].type).toBe("image/png");
  });

  it("a LINE error stops it and says which step failed", async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).endsWith("/richmenu/list") ? Response.json({ richmenus: [] }) : new Response("bad spec", { status: 400 }),
    );
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "LINE create menu 400: bad spec" });
  });
});

// Moving the menu to LINE OA Manager (13 Nov): a default set through the API wins over OA Manager's,
// so ours is taken off everyone and deleted. Other menus are left alone.
describe("DELETE /api/admin/richmenu", () => {
  let calls: string[];
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "line-token");
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push(`${init.method ?? "GET"} ${url.replace("https://api.line.me", "")}`);
        if (url.endsWith("/richmenu/list")) {
          return Response.json({ richmenus: [{ richMenuId: "old-1", name: "PorChai Main Menu v1" }, { richMenuId: "other", name: "someone else's" }] });
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses without the secret", async () => {
    expect((await DELETE(req("wrong", "DELETE"))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("takes the default off everyone, then deletes only our menu", async () => {
    const res = await DELETE(req("s3cret", "DELETE"));
    expect(await res.json()).toEqual({ removed: 1 });
    expect(calls).toEqual(["DELETE /v2/bot/user/all/richmenu", "GET /v2/bot/richmenu/list", "DELETE /v2/bot/richmenu/old-1"]);
  });

  it("a LINE error says which step failed", async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response("no", { status: 500 }));
    const res = await DELETE(req("s3cret", "DELETE"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "LINE clear default 500: no" });
  });
});
