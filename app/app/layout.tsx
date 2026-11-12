import { ApiProvider } from "./_providers/api-provider";
import { ConsentGate } from "./_providers/consent-gate";
import { LiffProvider } from "./_providers/liff-provider";
import { fontBody, fontDisplay } from "./fonts";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div
      className={`${fontBody.variable} ${fontDisplay.variable} min-h-full flex-1 bg-app font-body text-primary`}
    >
      <LiffProvider>
        <ApiProvider>
          <ConsentGate>{children}</ConsentGate>
        </ApiProvider>
      </LiffProvider>
    </div>
  );
}
