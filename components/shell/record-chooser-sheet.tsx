"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { Sheet } from "./sheet";

/** D0: choose what to record. Targets live under /app/record and /app/try (pages come later). */
export function RecordChooserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="จะจดอะไร">
      <div className="flex flex-col gap-3">
        <Link href="/app/record/new?type=expense" onClick={onClose} className={buttonClass("primary", true)}>
          จดรายจ่าย
        </Link>
        <Link href="/app/record/new?type=income" onClick={onClose} className={buttonClass("secondary", true)}>
          จดรายรับ
        </Link>
        <Link href="/app/try" onClick={onClose} className={buttonClass("secondary", true)}>
          ลองก่อนจ่าย
        </Link>
        <Button variant="ghost" block onClick={onClose}>
          ยกเลิก
        </Button>
      </div>
    </Sheet>
  );
}
