// Browser-only entry point. Cache init across React Strict Mode effect replays.
let pending: Promise<typeof import("@line/liff").default> | undefined;
let pendingId: string | undefined;

export function initializeLiff(liffId: string) {
  if (pending && pendingId !== liffId)
    return Promise.reject(
      new Error("LIFF is already initialized for a different app"),
    );
  if (!pending) {
    pendingId = liffId;
    pending = import("@line/liff")
      .then(async ({ default: liff }) => {
        await liff.init({ liffId });
        return liff;
      })
      .catch((error) => {
        pending = undefined;
        pendingId = undefined;
        throw error;
      });
  }
  return pending;
}
