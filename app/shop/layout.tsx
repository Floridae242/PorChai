import { Suspense } from "react";
import { ApiProvider } from "../app/_providers/api-provider";
import { LiffProvider } from "../app/_providers/liff-provider";
import { fontBody, fontDisplay } from "../app/fonts";

// A shop owner is not a student: LINE login (LIFF) is needed, but no consent gate, tab bar or sidebar.
export const instant = false;

export default function ShopLayout({ children }: LayoutProps<"/shop">) {
  return (
    <div
      data-app-root
      className={`${fontBody.variable} ${fontDisplay.variable} min-h-full flex-1 bg-app font-body text-primary`}
    >
      {/* Screens read useSearchParams; Next 16 + cacheComponents needs a Suspense boundary above them. */}
      <Suspense fallback={null}>
        <LiffProvider>
          <ApiProvider>{children}</ApiProvider>
        </LiffProvider>
      </Suspense>
    </div>
  );
}
