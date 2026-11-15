// The only place that talks to Microsoft Clarity. Nothing else may call `clarity(`; a guard test enforces it.
// No identify/set/event calls on purpose: no user id, name, amount or item name ever goes to Clarity.

export const CLARITY_SCRIPT_ID = "porchai-clarity";
const PROJECT_ID_PATTERN = /^[a-z0-9]{6,20}$/i;
const CONSENT_PATH = "/app/consent";

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };
declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

export type ClarityGate = {
  projectId: string | undefined;
  pathname: string | null;
  consented: boolean;
  liffReady: boolean;
};

export function isValidProjectId(id: string | undefined): id is string {
  return typeof id === "string" && PROJECT_ID_PATTERN.test(id);
}

// MINI App screens only (/app and below); never the consent page, /shop, /, /miniapp, /business.
export function isMiniAppPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === CONSENT_PATH) return false;
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function shouldLoadClarity(g: ClarityGate): boolean {
  return isValidProjectId(g.projectId) && isMiniAppPath(g.pathname) && g.consented && g.liffReady;
}

function call(...args: unknown[]) {
  window.clarity?.(...args);
}

// Injects the Clarity tag once, then tells it the user said yes (analytics only, ads denied).
export function loadClarity(projectId: string): boolean {
  if (typeof window === "undefined" || !isValidProjectId(projectId)) return false;
  if (document.getElementById(CLARITY_SCRIPT_ID)) {
    grantClarityConsent();
    return false;
  }
  const queue: ClarityFn = function (...args: unknown[]) {
    (queue.q = queue.q ?? []).push(args);
  };
  window.clarity = window.clarity ?? queue;
  const script = document.createElement("script");
  script.id = CLARITY_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
  document.head.appendChild(script);
  grantClarityConsent();
  return true;
}

export function grantClarityConsent(): void {
  call("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
}

// Erases Clarity's cookies and blocks further tracking until consent is granted again.
export function stopClarity(): void {
  if (typeof window === "undefined") return;
  call("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
  call("consent", false);
}
