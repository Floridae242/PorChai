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
      className={`${fontBody.variable} ${fontDisplay.variable} min-h-full flex-1 bg-app font-body text-primary`}
    >
      <LiffProvider>
        <ApiProvider>
          <ConsentGate>
            <AppShell>{children}</AppShell>
          </ConsentGate>
        </ApiProvider>
      </LiffProvider>
    </div>
  );
}
