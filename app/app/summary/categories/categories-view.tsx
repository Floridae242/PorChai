"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { ApiError } from "@/lib/client/errors";
import type { CategoryTotals } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { formatBaht } from "@/lib/format/money";

type State =
  | { kind: "loading" }
  | { kind: "ready"; totals: CategoryTotals }
  | { kind: "not_ready" }
  | { kind: "failed" };

export function CategoriesSummaryView() {
  const api = useApi();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .categoryTotals()
      .then((totals) => {
        if (!cancelled) setState({ kind: "ready", totals });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "no_cycle") {
          router.replace("/app/setup/income"); // stay on the neutral loading state
          return;
        }
        if (err instanceof ApiError && err.code === "no_consent") {
          router.replace("/app/consent");
          return;
        }
        setState(err instanceof ApiError && err.code === "not_implemented" ? { kind: "not_ready" } : { kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt]);

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="สรุปหมวดหมู่" back="/app" tone="default" />

      {state.kind === "loading" ? (
        <p className="py-8 text-sm text-secondary" aria-busy="true">
          กำลังโหลด…
        </p>
      ) : state.kind === "not_ready" ? (
        <Banner kind="info" text="ยังไม่พร้อมใช้งาน" />
      ) : state.kind === "failed" ? (
        <>
          <Banner kind="error" text="โหลดสรุปหมวดไม่สำเร็จ ลองใหม่อีกครั้ง" />
          <Button
            variant="primary"
            onClick={() => {
              setState({ kind: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            ลองใหม่
          </Button>
        </>
      ) : state.totals.items.length === 0 ? (
        <EmptyState
          title="ยังไม่มีข้อมูลใช้จ่ายแยกตามหมวด"
          body="เมื่อคุณจดรายการใช้จ่าย ระบบจะสรุปยอดแต่ละหมวดหมู่ให้ที่นี่"
          mascotPose="greeting"
        />
      ) : (
        <section className="divide-y divide-line rounded-md border border-line bg-card px-4">
          {state.totals.items.map((c) => (
            <ListRow
              key={c.category}
              title={CATEGORY_LABELS[c.category]}
              subtitle={`${c.count} รายการในรอบนี้`}
              amount={`${formatBaht(c.amount)} บาท`}
            />
          ))}
        </section>
      )}
    </main>
  );
}
