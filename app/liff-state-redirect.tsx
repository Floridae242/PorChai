"use client";

import { useEffect } from "react";
import { LIFF_ID } from "@/lib/liff/config";

// A LIFF link with a path (liff.line.me/<id>/some/page) first opens the endpoint with
// ?liff.state=/some/page; liff.init() then forwards to that page. Does nothing otherwise.
export function LiffStateRedirect() {
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("liff.state")) return;
    import("@line/liff").then(({ default: liff }) => liff.init({ liffId: LIFF_ID })).catch(console.error);
  }, []);
  return null;
}
