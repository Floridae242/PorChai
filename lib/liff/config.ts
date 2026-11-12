// Prefer the deployed MINI App/LIFF ID; retain the original Login app fallback.
// Its channel (the number before "-") must be one the server accepts: LINE_LOGIN_CHANNEL_ID or LINE_MINIAPP_CHANNEL_ID.
export const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "2012545176-udYyTUiA";

// Where a chat button opens the app (server side). A MINI App ID starts with the MINI App channel ID
// and opens at miniapp.line.me; a LIFF app opens at liff.line.me.
export function appUrl(): string {
  const id = process.env.NEXT_PUBLIC_LIFF_ID || LIFF_ID;
  const miniApp = process.env.LINE_MINIAPP_CHANNEL_ID;
  return miniApp && id.startsWith(`${miniApp}-`) ? `https://miniapp.line.me/${id}` : `https://liff.line.me/${id}`;
}
