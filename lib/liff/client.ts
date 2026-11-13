import { LIFF_ID } from "./config";
import { initializeLiff } from "@/lib/line/liff-client";

// Share initialization with the root deep-link bridge and the MINI App entry point.
export function getLiff() {
  return initializeLiff(LIFF_ID);
}
