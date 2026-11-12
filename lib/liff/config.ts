// Prefer the deployed MINI App/LIFF ID; retain the original Login app fallback.
// This public ID must match the server's LINE_LOGIN_CHANNEL_ID audience.
export const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "2012545176-udYyTUiA";
