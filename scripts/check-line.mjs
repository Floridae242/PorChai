import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Read-only upstream checks plus empty-event probes against our own webhook. */
export async function checkLine({
  env = process.env,
  origin,
  live = false,
  fetcher = fetch,
} = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const id = env.NEXT_PUBLIC_LIFF_ID || "";
  add("LIFF ID", /^\d+-[A-Za-z0-9]+$/.test(id), "NEXT_PUBLIC_LIFF_ID");
  add(
    "ID token audience",
    /^\d+$/.test(env.LINE_MINIAPP_CHANNEL_ID || "") &&
      id.split("-")[0] === env.LINE_MINIAPP_CHANNEL_ID,
    "MINI App channel must match the LIFF ID prefix",
  );
  add(
    "Messaging secret",
    /^[a-fA-F0-9]{32}$/.test(env.LINE_CHANNEL_SECRET || ""),
    "LINE_CHANNEL_SECRET (value hidden)",
  );
  add(
    "Messaging access token",
    Boolean(env.LINE_CHANNEL_ACCESS_TOKEN?.trim()),
    "LINE_CHANNEL_ACCESS_TOKEN (value hidden)",
  );
  let base;
  try {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw Error();
    base = url.origin;
    add("HTTPS origin", true, base);
  } catch {
    add(
      "HTTPS origin",
      false,
      "Pass --url https://your-developing-host (origin only)",
    );
  }
  if (!live || checks.some((check) => !check.ok))
    return { ok: checks.every((check) => check.ok), live: false, checks };

  async function probe(name, url, init, validate) {
    try {
      const response = await fetcher(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      add(name, await validate(response), `HTTP ${response.status}`);
    } catch {
      add(
        name,
        false,
        "Connection, redirect or response validation failed (credentials hidden)",
      );
    }
  }
  await probe(
    "LINE bot token",
    "https://api.line.me/v2/bot/info",
    { headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` } },
    async (response) => {
      if (!response.ok) return false;
      const body = await response.json();
      return (
        typeof body.basicId === "string" &&
        body.basicId.startsWith("@") &&
        (!env.NEXT_PUBLIC_LINE_OA_BASIC_ID ||
          body.basicId === env.NEXT_PUBLIC_LINE_OA_BASIC_ID)
      );
    },
  );
  await probe(
    "MINI App endpoint",
    `${base}/app`,
    { headers: { "ngrok-skip-browser-warning": "1" } },
    async (response) =>
      response.ok && (await response.text()).includes("PorChai"),
  );
  const body = '{"events":[]}';
  const signature = createHmac("sha256", env.LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  await probe(
    "Signed empty webhook",
    `${base}/api/line/webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-line-signature": signature,
      },
      body,
    },
    async (response) => {
      if (response.status !== 200) return false;
      const result = await response.json();
      return result.ok === true && result.received === 0;
    },
  );
  await probe(
    "Invalid signature rejected",
    `${base}/api/line/webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-line-signature": "invalid",
      },
      body,
    },
    async (response) => response.status === 401,
  );
  return { ok: checks.every((check) => check.ok), live: true, checks };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const index = process.argv.indexOf("--url");
  const result = await checkLine({
    origin: index >= 0 ? process.argv[index + 1] : undefined,
    live: process.argv.includes("--live"),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
