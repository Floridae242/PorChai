function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const channelId = process.env.LINE_MINIAPP_CHANNEL_ID;
  if (!channelId) return json({ error: "LINE MINI App is not configured" }, 503);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!input || typeof input !== "object" || !("idToken" in input) ||
      typeof input.idToken !== "string" || !input.idToken.trim() || input.idToken.length > 16384) {
    return json({ error: "Expected idToken" }, 400);
  }

  try {
    const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: input.idToken, client_id: channelId }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 400 || response.status === 401) return json({ error: "Invalid ID token" }, 401);
    if (!response.ok) return json({ error: "LINE verification unavailable" }, 502);
    const claims = await response.json();
    if (claims.iss !== "https://access.line.me" || claims.aud !== channelId ||
        typeof claims.sub !== "string" || !claims.sub ||
        typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) {
      return json({ error: "Invalid ID token" }, 401);
    }
    return json({ user: { id: claims.sub, name: typeof claims.name === "string" ? claims.name : null } });
  } catch {
    return json({ error: "LINE verification unavailable" }, 502);
  }
}
