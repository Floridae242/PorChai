import { clearAllClaimedCodes } from "./claimed-code";
import { clearConsentFlag } from "./consent-fallback";
import { clearPendingRecord } from "./pending-record";
import { clearSetupDraft } from "./setup-draft";
import { clearTryDraft } from "./try-draft";

// Everything this browser keeps for the user (consent flag, drafts, issued promo codes). Called only
// after the server confirmed "delete my data"; screens never touch storage directly.
export function clearAllLocalUserData(): void {
  clearConsentFlag();
  clearSetupDraft();
  clearTryDraft();
  clearPendingRecord();
  clearAllClaimedCodes();
}
