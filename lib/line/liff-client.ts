// Browser-only entry point. Cache init across React Strict Mode effect replays.
let pending: Promise<typeof import("@line/liff").default> | undefined;

export function initializeLiff(liffId: string) {
  if (!pending) {
    pending = import("@line/liff").then(async ({ default: liff }) => {
      await liff.init({ liffId });
      return liff;
    }).catch(error => {
      pending = undefined;
      throw error;
    });
  }
  return pending;
}
