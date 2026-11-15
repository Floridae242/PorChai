"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError } from "@/lib/client/errors";
import type { PointsHistoryItem } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import {useDataRevision} from "@/lib/client/use-data-revision";
import { formatThaiDate } from "@/lib/format/date";

const MSG_NOT_READY = "ยังไม่พร้อมใช้งาน";
const MSG_FAILED = "โหลดประวัติแต้มไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่อีกครั้ง";
const SHOWN_MAX = 50; // the server returns the latest 50

type Load = { state: "loading" } | { state: "not_ready" } | { state: "failed" } | { state: "ok"; items: PointsHistoryItem[] };

function dayText(day: string): string {
  try {
    return formatThaiDate(day, "long");
  } catch {
    return day;
  }
}

function HistoryRow({ item }: { item: PointsHistoryItem }) {
  const earned = item.delta > 0;
  const title = item.kind === "daily" ? "แต้มประจำวัน" : `แลก ${item.rewardName ?? "ของรางวัล"}`;
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-line bg-card px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-primary">{title}</span>
        <span className="text-xs text-secondary">{dayText(item.day)}</span>
      </div>
      <span
        className={`shrink-0 rounded-pill px-3 py-1 text-sm font-bold tabular-nums ${
          earned ? "bg-reward-bg text-primary" : "bg-subtle text-secondary"
        }`}
      >
        {earned ? "+" : "−"}
        {Math.abs(item.delta)} แต้ม
      </span>
    </li>
  );
}

export function PointsHistoryView() {
  const api = useApi();
  const revision=useDataRevision();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.pointsHistory().then(
      (h) => {
        if (!cancelled) setLoad({ state: "ok", items: h.items });
      },
      (err) => {
        if (cancelled) return;
        setLoad({ state: err instanceof ApiError && err.code === "not_implemented" ? "not_ready" : "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, attempt,revision]);

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ประวัติแต้ม" back="/app/points" tone="default" />

      {load.state === "loading" ? (
        <p className="text-sm text-secondary" aria-busy="true">
          กำลังโหลดประวัติแต้ม…
        </p>
      ) : load.state === "not_ready" ? (
        <Banner kind="info" text={MSG_NOT_READY} />
      ) : load.state === "failed" ? (
        <div className="flex flex-col gap-3">
          <Banner kind="error" text={MSG_FAILED} />
          <Button
            variant="secondary"
            onClick={() => {
              setLoad({ state: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            ลองใหม่
          </Button>
        </div>
      ) : load.items.length === 0 ? (
        <EmptyState
          mascotPose="reward"
          title="ยังไม่มีประวัติแต้ม"
          body="จดรายการวันนี้ รับอัตโนมัติ 1 แต้ม หรือกดรับแต้มฟรีในหน้าแต้มก็ได้ วันละครั้ง"
          action={{ label: "ไปหน้าแต้ม", href: "/app/points", variant: "secondary" }}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2" aria-label="ประวัติแต้ม">
            {load.items.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ul>
          {load.items.length >= SHOWN_MAX ? (
            <p className="text-center text-xs text-muted">แสดง {SHOWN_MAX} รายการล่าสุด</p>
          ) : null}
        </>
      )}
    </main>
  );
}
