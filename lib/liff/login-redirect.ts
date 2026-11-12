// Only return to app routes. Never accept origins, query strings or encoded paths.
export function appReturnPath(value: string | null): string | null {
  return value && /^\/app(?:\/[A-Za-z0-9_-]+)*\/?$/.test(value) ? value : null;
}

export function loginRedirectUri(origin: string, pathname: string): string {
  const callback = new URL("/miniapp", origin);
  const path = appReturnPath(pathname);
  if (path) callback.searchParams.set("returnTo", path);
  return callback.href;
}
