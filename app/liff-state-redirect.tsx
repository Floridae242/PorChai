"use client";

import { useEffect } from "react";
import { getLiff } from "@/lib/liff/client";

// A LIFF link with a path (liff.line.me/<id>/some/page) first opens the endpoint with
// ?liff.state=/some/page; liff.init() then forwards to that page. Does nothing otherwise.
export function LiffStateRedirect() {
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("liff.state")) return;
    getLiff().catch(console.error);
  }, []);
  return null;
}
