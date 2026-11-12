"use client";

import { useEffect } from "react";
import { getLiff } from "@/lib/liff/client";
import { shouldInitializeLegacyLiff } from "@/lib/liff/redirect";

// A LIFF link with a path (liff.line.me/<id>/some/page) first opens the endpoint with
// ?liff.state=/some/page; liff.init() then forwards to that page. Does nothing otherwise.
export function LiffStateRedirect() {
  useEffect(() => {
    if (
      !shouldInitializeLegacyLiff(
        window.location.pathname,
        window.location.search,
      )
    )
      return;
    getLiff().catch(() =>
      console.error("LIFF deep-link initialization failed"),
    );
  }, []);
  return null;
}
