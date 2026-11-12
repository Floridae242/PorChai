export type TabKey = "summary" | "plan" | "record" | "perks" | "settings";

/** True when `pathname` is `base` or below it (segment boundary, so /app/planet is not /app/plan). */
function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Which tab a route belongs to, or null when nothing should be highlighted. */
export function tabForPath(pathname: string): TabKey | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (p === "/app") return "summary";
  if (under(p, "/app/summary") || under(p, "/app/cycle")) return "summary";
  // TODO(open-question): confirm against Figma 1280 sidebar
  if (under(p, "/app/plan/edit") || under(p, "/app/balance")) return "summary";
  if (under(p, "/app/plan")) return "plan";
  if (under(p, "/app/perks") || under(p, "/app/points")) return "perks";
  if (under(p, "/app/settings")) return "settings";
  return null;
}

/** Pages rendered without tab bar / sidebar: consent, first-time setup, demo menu, app-open loading. */
export function hideNav(pathname: string): boolean {
  return (
    under(pathname, "/app/consent") ||
    under(pathname, "/app/setup") ||
    under(pathname, "/app/demo") ||
    under(pathname, "/app/loading")
  );
}
