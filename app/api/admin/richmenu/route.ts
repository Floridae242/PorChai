import { buildRichMenuSpec } from "@/lib/line/flex";
import { refuseWithoutSecret } from "@/lib/ops-secret";

// Rich menu setup, run once after a deploy that changes it: โฟรวิว's spec (buildRichMenuSpec) and image
// (public/richmenu.png, 2500×1686). Postback areas need the Messaging API — LINE OA Manager's editor
// cannot send them. The LINE token is only on Vercel, so this runs there, behind CRON_SECRET.
// Our previous menu (same name) is deleted so menus do not pile up; other menus are left alone.

const API = "https://api.line.me/v2/bot";
const DATA_API = "https://api-data.line.me/v2/bot";

class LineError extends Error {}

async function line(step: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new LineError(`LINE ${step} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function POST(request: Request): Promise<Response> {
  const refused = refuseWithoutSecret(request);
  if (refused) return refused;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return Response.json({ error: "Missing LINE_CHANNEL_ACCESS_TOKEN" }, { status: 503 });
  const auth = { Authorization: `Bearer ${token}` };
  const spec = buildRichMenuSpec();

  try {
    const list = (await (await line("list menus", `${API}/richmenu/list`, { headers: auth })).json()) as {
      richmenus: { richMenuId: string; name: string }[];
    };
    const old = list.richmenus.filter((m) => m.name === spec.name);
    for (const m of old) await line("delete old menu", `${API}/richmenu/${m.richMenuId}`, { method: "DELETE", headers: auth });

    const { richMenuId } = (await (
      await line("create menu", `${API}/richmenu`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      })
    ).json()) as { richMenuId: string };

    const image = await fetch(new URL("/richmenu.png", request.url).toString());
    if (!image.ok) throw new LineError(`image ${image.status}`);
    await line("upload image", `${DATA_API}/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "image/png" },
      body: await image.arrayBuffer(),
    });
    await line("set default", `${API}/user/all/richmenu/${richMenuId}`, { method: "POST", headers: auth });
    return Response.json({ richMenuId, replaced: old.length });
  } catch (err) {
    if (err instanceof LineError) return Response.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
