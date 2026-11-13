import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ApiProvider } from "./_providers/api-provider";
import { ConsentGate } from "./_providers/consent-gate";
import { LiffProvider } from "./_providers/liff-provider";
import { fontBody, fontDisplay } from "./fonts";

// The whole MINI App is client-gated by LIFF login + consent, so it opts out of instant-navigation validation.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div
      data-app-root
      className={`${fontBody.variable} ${fontDisplay.variable} min-h-full flex-1 bg-app font-body text-primary`}
    >
      {/* Screens read useParams/useSearchParams; Next 16 + cacheComponents needs a Suspense boundary above
          them or prerender fails. Everything here is client-gated (LIFF + consent), so a null fallback is fine. */}
      <Suspense fallback={null}>
        <LiffProvider>
          <ApiProvider>
            <ConsentGate>
              <AppShell>{children}</AppShell>
            </ConsentGate>
          </ApiProvider>
        </LiffProvider>
      </Suspense>
      <div id="app-portal" />
    </div>
  );
}
