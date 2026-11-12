export type MiniAppUser = Readonly<{ id: string; name: string | null }>;

/** Only the server's LINE verification result establishes the displayed identity. */
export async function verifyMiniAppUser(idToken: string | null, fetcher: typeof fetch = fetch): Promise<MiniAppUser> {
  if (!idToken) throw new Error("ไม่พบข้อมูลยืนยันตัวตน กรุณาเปิด MINI App จาก LINE อีกครั้ง");
  const response = await fetcher("/api/line/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่");
  const data = await response.json();
  if (!data?.user || typeof data.user.id !== "string" || !data.user.id ||
      !(data.user.name === null || typeof data.user.name === "string")) {
    throw new Error("ข้อมูลยืนยันตัวตนไม่ครบ กรุณาลองใหม่");
  }
  return { id: data.user.id, name: data.user.name };
}
