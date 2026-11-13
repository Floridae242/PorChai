"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApi } from "@/lib/client/use-api";

const CONSENT_PATH = "/app/consent";

// Nothing financial renders or is fetched until the user has consented. The consent page itself is exempt.
export function ConsentGate({ children }: { children: ReactNode }) {
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const onConsentPage = pathname === CONSENT_PATH;
  const [accepted, setAccepted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (onConsentPage || accepted) return;
    let cancelled = false;
    api.consent().then(
      (c) => {
        if (cancelled) return;
        if (c.accepted) setAccepted(true);
        else router.replace(CONSENT_PATH);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, router, onConsentPage, accepted, attempt]);

  if (onConsentPage || accepted) return <>{children}</>;

  if (failed) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-start gap-4 p-6 font-body">
        <p className="text-secondary">เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง</p>
        <button
          type="button"
          className="rounded-pill bg-action-primary px-6 py-3 font-semibold text-on-action"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          ลองใหม่
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 font-body text-secondary" aria-busy="true">
      กำลังโหลด…
    </main>
  );
}
