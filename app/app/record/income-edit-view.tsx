"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Sheet } from "@/components/shell/sheet";
import { useToast } from "@/components/shell/toast";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/input-field";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import type { Income } from "@/lib/api-types";
import { thaiDate } from "@/lib/calc/time";
import { ApiError } from "@/lib/client/errors";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
import {
  formatBaht,
  parseBahtInput,
  satangToInputString,
} from "@/lib/format/money";

const BACK = "/app/plan?tab=list";
const NOT_READY =
  "ยังไม่พร้อมใช้งาน — ตอนนี้ยังแก้หรือลบรายรับในแอปไม่ได้ ข้อมูลของคุณยังเหมือนเดิม";

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError)
    return err.code === "not_implemented" ? NOT_READY : err.message;
  return fallback;
}

// Edit or delete one income (the money rows in แผนเงิน › รายการ). The server has no endpoint for this yet,
// so on the real backend the save answers "ยังไม่พร้อมใช้งาน" and nothing changes.
export function IncomeEditView() {
  const api = useApi();
  const router = useRouter();
  const toast = useToast();
  const id = useParams<{ id: string }>()?.id ?? "";
  const save = useSubmit();
  const del = useSubmit();

  const [income, setIncome] = useState<Income | null>(null);
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const busy = save.busy || del.busy;
  const today = thaiDate(new Date());

  useEffect(() => {
    let cancelled = false;
    api
      .incomes()
      .then(({ incomes }) => {
        if (cancelled) return;
        const found = incomes.find((i) => i.id === id) ?? null;
        if (found) {
          setIncome(found);
          setAmountText(satangToInputString(found.amount));
          setNote(found.note ?? "");
          setReceivedOn(found.receivedOn);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "no_cycle") {
          router.replace("/app/setup/income");
          return;
        }
        if (err instanceof ApiError && err.code === "no_consent") {
          router.replace("/app/consent");
          return;
        }
        setLoadFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, id, attempt]);

  async function handleSave() {
    if (!income) return;
    const parsed = parseBahtInput(amountText);
    if (!parsed.ok) {
      setAmountError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    if (!receivedOn || receivedOn > today) {
      setError("วันที่รับเงินต้องไม่เกินวันนี้");
      return;
    }
    setAmountError(null);
    setError(null);
    const body = {
      amount: parsed.satang,
      note: note.trim() || null,
      receivedOn,
    };
    const result = await save.submit({ id: income.id, ...body }, () =>
      api.editIncome(income.id, body),
    );
    if (result.ok) {
      toast.show("บันทึกการแก้ไขแล้ว", { mascot: "budgetOk" });
      router.replace(BACK);
      return;
    }
    if ("skipped" in result) return;
    setError(errorText(result.error, "แก้ไขไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }

  async function handleDelete() {
    if (!income) return;
    setError(null);
    const result = await del.submit(income.id, () =>
      api.cancelIncome(income.id),
    );
    if (result.ok) {
      setDeleteOpen(false);
      toast.show("ลบรายรับแล้ว");
      router.replace(BACK);
      return;
    }
    if ("skipped" in result) return;
    setDeleteOpen(false);
    setError(errorText(result.error, "ลบรายรับไม่สำเร็จ"));
  }

  if (loading) {
    return (
      <main className="py-2 font-body">
        <LoadingSkeleton label="กำลังโหลดรายการ…" />
      </main>
    );
  }
  if (loadFailed) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="แก้ไขรายรับ" back={BACK} tone="default" />
        <Banner kind="error" text="โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง" />
        <Button
          variant="primary"
          onClick={() => {
            setLoading(true);
            setLoadFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          ลองใหม่
        </Button>
      </main>
    );
  }
  if (!income) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="แก้ไขรายรับ" back={BACK} tone="default" />
        <Banner kind="error" text="ไม่พบรายการนี้" />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="แก้ไขรายรับ" back={BACK} tone="default" />

      <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
        <InputField
          label="จำนวนเงิน (บาท)"
          inputMode="decimal"
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value);
            if (amountError) setAmountError(null);
          }}
          state={amountError ? "error" : "filled"}
          helper={amountError ?? undefined}
        />
        <InputField
          label="ชื่อรายการ"
          value={note}
          placeholder="เช่น ได้ค่าขนมเพิ่ม"
          onChange={(e) => setNote(e.target.value)}
          state={note ? "filled" : "default"}
        />
        <InputField
          label="วันที่ได้รับ"
          type="date"
          max={today}
          value={receivedOn}
          onChange={(e) => setReceivedOn(e.target.value)}
          state="filled"
        />
      </section>

      {error ? (
        <Banner kind={error === NOT_READY ? "info" : "error"} text={error} />
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          block
          busy={save.busy}
          disabled={busy}
          onClick={handleSave}
        >
          บันทึกการแก้ไข
        </Button>
        <Button
          variant="secondary"
          block
          disabled={busy}
          onClick={() => setDeleteOpen(true)}
        >
          ลบรายรับนี้
        </Button>
      </div>

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="ยืนยันลบรายรับนี้ไหม"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            เมื่อลบ &quot;{income.note ?? "รายรับ"}&quot; (
            {formatBaht(income.amount)} บาท) ระบบจะคำนวณเงินที่มีและงบรายวันใหม่ทันที
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              block
              busy={del.busy}
              onClick={handleDelete}
            >
              ยืนยันลบรายรับ
            </Button>
            <Button
              variant="ghost"
              block
              disabled={del.busy}
              onClick={() => setDeleteOpen(false)}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
