import type { Liff } from "@line/liff";
import { LIFF_ID } from "./config";

// The one place liff.init runs, so the app never initialises LIFF twice.
let ready: Promise<Liff> | null = null;

export function getLiff(): Promise<Liff> {
  if (!ready) {
    ready = import("@line/liff")
      .then(async ({ default: liff }) => {
        await liff.init({ liffId: LIFF_ID });
        return liff;
      })
      .catch((err) => {
        ready = null; // allow a retry after a failed init
        throw err;
      });
  }
  return ready;
}
