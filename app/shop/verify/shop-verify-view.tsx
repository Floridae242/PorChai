"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import { ApiError } from "@/lib/client/errors";
import type { PorchaiApi } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";

type RedeemResult = Awaited<ReturnType<PorchaiApi["shopRedeem"]>>;
type Outcome = { kind: "result"; result: RedeemResult } | { kind: "unavailable" } | { kind: "error"; message: string };

const NETWORK_MESSAGE = "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง";

export function ShopVerifyView() {
  const api = useApi();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => (searchParams?.get("code") ?? "").trim().toUpperCase());
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const { submit, busy, reset } = useSubmit<RedeemResult>();

  function onChange(value: string) {
    setCode(value.toUpperCase());
    setOutcome(null);
    reset();
  }

  async function handleVerify() {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    const res = await submit(clean, () => api.shopRedeem(clean));
    if (res.ok) {
      setOutcome({ kind: "result", result: res.value });
    } else if ("error" in res) {
      const err = res.error;
      if (err instanceof ApiError) {
        setOutcome(
          err.code === "not_implemented" ? { kind: "unavailable" } : { kind: "error", message: err.message },
        );
      } else {
        setOutcome({ kind: "error", message: NETWORK_MESSAGE });
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6 font-body">
      <header className="border-b border-line pb-3">
        <h1 className="text-xl font-bold text-primary">พอใช้ สำหรับร้านค้า</h1>
      </header>

      <form
        className="flex flex-col gap-4 rounded-md border border-line bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleVerify();
        }}
      >
        <div data-clarity-mask="true">
          <InputField
            label="รหัสจากลูกค้า"
            placeholder="เช่น PC-7K3Q"
            value={code}
            onChange={(e) => onChange(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            state={code ? "filled" : "default"}
            helper="พิมพ์รหัสจากหน้าจอลูกค้า ระบบนับสิทธิ์ครั้งเดียว หากกดซ้ำจะไม่นับซ้ำ"
          />
        </div>
        <Button type="submit" variant="primary" block busy={busy} disabled={!code.trim()}>
          ตรวจรหัส
        </Button>
      </form>

      {outcome ? (
        <section data-clarity-mask="true" className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
          {outcome.kind === "unavailable" ? (
            <Banner kind="info" text="ยังไม่พร้อมใช้งาน" />
          ) : outcome.kind === "error" ? (
            <Banner kind="error" text={outcome.message} />
          ) : outcome.result.status === "redeemed" ? (
            <Banner
              kind="info"
              text={`ใช้ได้ ✓ ${outcome.result.promoTitle ? `(${outcome.result.promoTitle}) ` : ""}· นับสิทธิ์ 1 ครั้ง`}
            />
          ) : outcome.result.status === "already_redeemed" ? (
            <Banner kind="warn" text="รหัสนี้ใช้ไปแล้ว ระบบไม่นับซ้ำ" />
          ) : outcome.result.status === "expired" ? (
            <Banner kind="error" text="รหัสนี้หมดอายุแล้ว" />
          ) : (
            <Banner kind="error" text="ไม่พบรหัสนี้ในระบบ กรุณาตรวจสอบตัวอักษรอีกครั้ง" />
          )}
        </section>
      ) : null}

      <p className="text-xs text-secondary">ร้านเห็นเฉพาะจำนวนการใช้สิทธิ์ ไม่เห็นชื่อ ยอดเงิน หรือแผนของลูกค้า</p>
    </main>
  );
}
