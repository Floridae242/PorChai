// Browser-only entry point. Cache init across React Strict Mode effect replays.
type LiffSdk = typeof import("@line/liff").default;

let pending: Promise<LiffSdk> | undefined;
let pendingId: string | undefined;

// E2E seam for Playwright (tests/e2e/helpers/liff-mock.ts): a stand-in LIFF object injected as
// window.liff before page load, so flows run without the LINE app. Honoured only when BOTH
// NEXT_PUBLIC_E2E_LIFF_MOCK=1 is set at build time and this is not a production build;
// otherwise the branch is dead code and the bundler drops it.
function e2eLiff(): LiffSdk | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  if (process.env.NEXT_PUBLIC_E2E_LIFF_MOCK !== "1") return undefined;
  if (typeof window === "undefined") return undefined;
  const candidate = (window as unknown as { liff?: { __porchaiE2E?: boolean } }).liff;
  return candidate?.__porchaiE2E === true ? (candidate as unknown as LiffSdk) : undefined;
}

export function initializeLiff(liffId: string) {
  if (pending && pendingId !== liffId)
    return Promise.reject(
      new Error("LIFF is already initialized for a different app"),
    );
  if (!pending) {
    pendingId = liffId;
    const fake = e2eLiff();
    pending = (
      fake
        ? fake.init({ liffId }).then(() => fake)
        : import("@line/liff").then(async ({ default: liff }) => {
            await liff.init({ liffId });
            return liff;
          })
    ).catch((error) => {
      pending = undefined;
      pendingId = undefined;
      throw error;
    });
  }
  return pending;
}
