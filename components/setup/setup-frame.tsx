"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Sheet } from "@/components/shell/sheet";
import { Button } from "@/components/ui/button";
import { loadSetupDraft, saveSetupDraft } from "@/lib/client/setup-draft";

const STEPS = [
  { step: 1, label: "เงินเข้า" },
  { step: 2, label: "เงินที่มี · บิล" },
  { step: 3, label: "ออม · เผื่อ" },
  { step: 4, label: "ค่าจำเป็น" },
  { step: 5, label: "ตรวจสรุป" },
] as const;

export interface SetupFrameProps {
  step: 1 | 2 | 3 | 4 | 5;
  title: string;
  subtitle?: string;
  backHref: string;
  currentPath: string;
  children: ReactNode;
}

export function SetupFrame({ step, title, subtitle, backHref, currentPath, children }: SetupFrameProps) {
  const router = useRouter();
  const [exitOpen, setExitOpen] = useState(false);

  function confirmExit() {
    const draft = loadSetupDraft();
    saveSetupDraft({ ...draft, savedStep: currentPath });
    setExitOpen(false);
    router.push("/app/consent");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-between gap-6 px-4 py-4 font-body">
      <div className="flex flex-col gap-4">
        <header className="flex h-12 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link
              href={backHref}
              aria-label="ย้อนกลับ"
              className="flex size-10 items-center justify-center rounded-pill text-2xl leading-none text-primary"
            >
              <span aria-hidden="true">‹</span>
            </Link>
            <h1 className="text-lg font-semibold text-primary">{title}</h1>
          </div>
          <button
            type="button"
            onClick={() => setExitOpen(true)}
            className="rounded-pill px-3 py-1.5 text-sm font-semibold text-link"
          >
            ออกก่อน
          </button>
        </header>

        <nav aria-label="ขั้นตอนการตั้งค่า" className="grid grid-cols-5 gap-1.5">
          {STEPS.map((s) => (
            <div key={s.step} className="flex flex-col gap-1">
              <div
                className={`h-1.5 rounded-pill ${
                  s.step <= step ? "bg-action-primary" : "bg-line"
                }`}
              />
              <span className="truncate text-[11px] text-secondary">{s.label}</span>
            </div>
          ))}
        </nav>

        {subtitle ? <p className="text-sm text-secondary">{subtitle}</p> : null}

        {children}
      </div>

      <Sheet open={exitOpen} onClose={() => setExitOpen(false)} title="ออกจากหน้าตั้งค่าก่อนไหม">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            ข้อมูลที่กรอกไว้จะถูกเก็บเป็นร่างในเครื่อง เมื่อกลับมาเปิดใหม่สามารถทำต่อจากขั้นนี้ได้ทันที
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" block onClick={confirmExit}>
              เก็บร่างแล้วออก
            </Button>
            <Button variant="ghost" block onClick={() => setExitOpen(false)}>
              ทำต่อ
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
