// The promo code the server just issued, handed from P2 (claim) to P3 (show). It lives in
// sessionStorage only so P3 survives a reload; P3 only READS it and never claims anything itself.
// Read after mount (never during render) so server and client markup match.
const PREFIX = "porchai.claimed_code.v1.";

export interface ClaimedCode {
  code: string;
  expiresAt: string;
}

export function saveClaimedCode(promoId: string, claim: ClaimedCode): void {
  try {
    window.sessionStorage.setItem(PREFIX + promoId, JSON.stringify(claim));
  } catch {
    // storage blocked: P3 will send the user back to P2
  }
}

export function loadClaimedCode(promoId: string): ClaimedCode | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + promoId);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<ClaimedCode> | null;
    if (!d || typeof d.code !== "string" || d.code === "" || typeof d.expiresAt !== "string") return null;
    return { code: d.code, expiresAt: d.expiresAt };
  } catch {
    return null;
  }
}

export function clearClaimedCode(promoId: string): void {
  try {
    window.sessionStorage.removeItem(PREFIX + promoId);
  } catch {
    // ignore
  }
}

export function clearAllClaimedCodes(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) window.sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
}
