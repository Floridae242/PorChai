// MINI App initializes its own LIFF app; the legacy bridge owns other endpoints.
export function shouldInitializeLegacyLiff(pathname: string, search: string) {
  return (
    pathname !== "/miniapp" &&
    !pathname.startsWith("/miniapp/") &&
    new URLSearchParams(search).has("liff.state")
  );
}
