"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { loadClarity, shouldLoadClarity } from "@/lib/clarity";
import { useLiff } from "./liff-provider";

// Rendered by ConsentGate only after the user accepted. Empty NEXT_PUBLIC_CLARITY_PROJECT_ID = Clarity off.
export function ClarityLoader() {
  const pathname = usePathname();
  const { ready } = useLiff();
  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

  useEffect(() => {
    if (shouldLoadClarity({ projectId, pathname, consented: true, liffReady: ready })) {
      loadClarity(projectId as string);
    }
  }, [projectId, pathname, ready]);

  return null;
}
