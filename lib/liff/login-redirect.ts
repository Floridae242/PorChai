// Only return to app routes. Never accept origins, query strings or encoded paths.
export function appReturnPath(value: string | null): string | null {
  return value && /^\/app(?:\/[A-Za-z0-9_-]+)*\/?$/.test(value) ? value : null;
}

export function loginRedirectUri(origin: string, pathname: string): string {
  // The canonical LINE Developers endpoint is /app. All financial screens are beneath it.
  return new URL(appReturnPath(pathname) ?? "/app", origin).href;
}
