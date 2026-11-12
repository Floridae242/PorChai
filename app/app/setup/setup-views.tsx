"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BillsCard } from "@/components/setup/bills-card";
import { BufferCard, EssentialPicker, SavingsPicker } from "@/components/setup/savings-picker";
import { SetupFrame } from "@/components/setup/setup-frame";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InputField } from "@/components/ui/input-field";
import { Mascot } from "@/components/ui/mascot";
import { ApiError } from "@/lib/client/errors";
import { DEFAULT_TODAY } from "@/lib/client/mock-fixtures";
import {
  clearSetupDraft,
  draftToNewCycleRequest,
  loadSetupDraft,
  previewSetupDraft,
  saveSetupDraft,
  type SetupDraft,
} from "@/lib/client/setup-draft";
import { useApi } from "@/lib/client/use-api";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht, parseBahtInput } from "@/lib/format/money";

const SOURCES: { key: SetupDraft["incomeSource"]; label: string }[] = [
  { key: "family", label: "ทางบ้านส่งให้" },
  { key: "side_job", label: "ทำงานพิเศษ" },
  { key: "other", label: "กยศ. / อื่น ๆ" },
];

const FREQUENCIES: { key: SetupDraft["incomeFrequency"]; label: string; paydayLabel: string }[] = [
  { key: "monthly", label: "รายเดือน", paydayLabel: "วันเงินเข้าครั้งถัดไป" },
  { key: "weekly", label: "รายสัปดาห์", paydayLabel: "วันรับเงินรายสัปดาห์ถัดไป" },
  { key: "irregular", label: "ไม่แน่นอน", paydayLabel: "กะว่าจะใช้ก้อนนี้ถึงวันที่เท่าไหร่" },
];

export function SetupIncomeView() {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft>(() => loadSetupDraft());
  const [error, setError] = useState<string | null>(null);

  const freqMeta = FREQUENCIES.find((f) => f.key === draft.incomeFrequency) ?? FREQUENCIES[0];

  function handleNext() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.payday) || draft.payday <= DEFAULT_TODAY) {
      setError("กรุณาเลือกวันที่หลังวันนี้");
      return;
    }
    saveSetupDraft(draft);
    router.push("/app/setup/balance");
  }

  let formattedPayday = "";
  try {
    formattedPayday = formatThaiDate(draft.payday, "long");
  } catch {
    formattedPayday = "";
  }

  return (
    <SetupFrame
      step={1}
      title="ตั้งค่า 1/4 · เงินเข้า"
      subtitle="บอกที่มาและวันเงินเข้า เพื่อให้พอใช้หารงบรายวันได้ตรงกับรอบเงินจริงของคุณ"
      backHref="/app/consent"
      currentPath="/app/setup/income"
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-primary">แหล่งเงินหลัก</h2>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <Chip
                key={s.key}
                selected={draft.incomeSource === s.key}
                onClick={() => setDraft((d) => ({ ...d, incomeSource: s.key }))}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-primary">ความถี่ที่เงินเข้า</h2>
          <div className="flex flex-wrap gap-2">
            {FREQUENCIES.map((f) => (
              <Chip
                key={f.key}
                selected={draft.incomeFrequency === f.key}
                onClick={() => setDraft((d) => ({ ...d, incomeFrequency: f.key }))}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <InputField
            label={freqMeta.paydayLabel}
            type="date"
            value={draft.payday}
            onChange={(e) => {
              setError(null);
              setDraft((d) => ({ ...d, payday: e.target.value }));
            }}
            state={error ? "error" : draft.payday ? "filled" : "default"}
            helper={
              error ??
              (formattedPayday
                ? `นับรวมวันนี้จนถึง ${formattedPayday}`
                : "เลือกวันที่เงินรอบถัดไปจะเข้า")
            }
          />
        </section>

        <Button variant="primary" block onClick={handleNext}>
          ถัดไป
        </Button>
      </div>
    </SetupFrame>
  );
}

export function SetupBalanceView() {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft>(() => loadSetupDraft());
  const [balanceText, setBalanceText] = useState(() => formatBaht(draft.balance).replace(/,/g, ""));
  const [error, setError] = useState<string | null>(null);

  const preview = previewSetupDraft(draft);

  function handleBalanceChange(val: string) {
    setBalanceText(val);
    const parsed = parseBahtInput(val);
    if (parsed.ok) {
      setError(null);
      setDraft((d) => ({ ...d, balance: parsed.satang }));
    }
  }

  function handleNext() {
    const parsed = parseBahtInput(balanceText);
    if (!parsed.ok) {
      setError("กรุณาใส่ยอดเงินที่มีตอนนี้เป็นตัวเลขมากกว่า 0");
      return;
    }
    const updated = { ...draft, balance: parsed.satang };
    saveSetupDraft(updated);
    router.push("/app/setup/savings");
  }

  return (
    <SetupFrame
      step={2}
      title="ตั้งค่า 2/4 · เงินที่มี + บิล"
      subtitle="กรอกเงินที่มีตอนนี้ และเช็กบิลประจำที่ต้องจ่ายก่อนเงินรอบหน้าจะเข้า"
      backHref="/app/setup/income"
      currentPath="/app/setup/balance"
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
          <InputField
            label="เงินที่มีตอนนี้ (บาท)"
            inputMode="decimal"
            placeholder="เช่น 2400"
            value={balanceText}
            onChange={(e) => handleBalanceChange(e.target.value)}
            state={error ? "error" : balanceText ? "filled" : "default"}
            helper={error ?? "รวมเงินสดและเงินในบัญชีที่ใช้จ่ายในรอบนี้"}
          />
        </section>

        <BillsCard
          bills={draft.bills}
          unpaidBillsTotal={preview.unpaidBillsTotal}
          onAdd={(b) =>
            setDraft((d) => ({
              ...d,
              bills: [...d.bills, { ...b, id: `draft-bill-${Date.now()}` }],
            }))
          }
          onUpdate={(updated) =>
            setDraft((d) => ({
              ...d,
              bills: d.bills.map((b) => (b.id === updated.id ? updated : b)),
            }))
          }
          onDelete={(id) =>
            setDraft((d) => ({
              ...d,
              bills: d.bills.filter((b) => b.id !== id),
            }))
          }
        />

        <Button variant="primary" block onClick={handleNext}>
          ถัดไป
        </Button>
      </div>
    </SetupFrame>
  );
}

export function SetupSavingsView() {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft>(() => loadSetupDraft());
  const preview = previewSetupDraft(draft);

  function handleNext() {
    saveSetupDraft(draft);
    router.push("/app/setup/essentials");
  }

  function handleSkip() {
    const skipped: SetupDraft = { ...draft, savingsMode: "none", savingsAmount: 0, emergencyBuffer: 0 };
    saveSetupDraft(skipped);
    router.push("/app/setup/essentials");
  }

  return (
    <SetupFrame
      step={3}
      title="ตั้งค่า 3/4 · กันเงินออม + เงินเผื่อ"
      subtitle="หักเงินออมและเงินเผื่อไว้ตั้งแต่ต้นรอบ เพื่อไม่เผลอใช้เกิน"
      backHref="/app/setup/balance"
      currentPath="/app/setup/savings"
    >
      <div className="flex flex-col gap-5">
        <SavingsPicker
          mode={draft.savingsMode}
          percent={draft.savingsPercent}
          savingsSatang={preview.savingsSatang}
          percentOptions={preview.percentOptions}
          onChangePercent={(pct) => setDraft((d) => ({ ...d, savingsMode: "percent", savingsPercent: pct }))}
          onChangeAmount={(satang) => setDraft((d) => ({ ...d, savingsMode: "amount", savingsAmount: satang }))}
          onClear={() => setDraft((d) => ({ ...d, savingsMode: "none", savingsAmount: 0 }))}
        />

        <BufferCard
          bufferSatang={draft.emergencyBuffer}
          onChangeBuffer={(satang) => setDraft((d) => ({ ...d, emergencyBuffer: satang }))}
        />

        <div className="flex flex-col gap-2">
          <Button variant="primary" block onClick={handleNext}>
            ถัดไป
          </Button>
          <Button variant="ghost" block onClick={handleSkip}>
            ข้ามไปก่อน
          </Button>
        </div>
      </div>
    </SetupFrame>
  );
}

export function SetupEssentialsView() {
  const router = useRouter();
  const [draft, setDraft] = useState<SetupDraft>(() => loadSetupDraft());

  function handleNext() {
    saveSetupDraft(draft);
    router.push("/app/setup/review");
  }

  function handleSkip() {
    const skipped: SetupDraft = { ...draft, essentialPerDay: null };
    saveSetupDraft(skipped);
    router.push("/app/setup/review");
  }

  return (
    <SetupFrame
      step={4}
      title="ตั้งค่า 4/4 · ค่าจำเป็นต่อวัน"
      subtitle="บอกยอดขั้นต่ำที่ต้องใช้ทุกวัน เช่น ค่าอาหารและค่าเดินทาง เพื่อให้พอใช้ช่วยเตือนตอนลองซื้อของ"
      backHref="/app/setup/savings"
      currentPath="/app/setup/essentials"
    >
      <div className="flex flex-col gap-5">
        <EssentialPicker
          essentialPerDay={draft.essentialPerDay}
          note={draft.essentialNote}
          onChangeEssential={(satang) => setDraft((d) => ({ ...d, essentialPerDay: satang }))}
          onChangeNote={(note) => setDraft((d) => ({ ...d, essentialNote: note }))}
        />

        <div className="flex flex-col gap-2">
          <Button variant="primary" block onClick={handleNext}>
            ดูสรุปแผน
          </Button>
          <Button variant="ghost" block onClick={handleSkip}>
            ข้ามไปก่อน
          </Button>
        </div>
      </div>
    </SetupFrame>
  );
}

const TIGHT_THRESHOLD_SATANG = 5000; // 50 baht/day

export function SetupReviewView() {
  const api = useApi();
  const router = useRouter();
  const [draft] = useState<SetupDraft>(() => loadSetupDraft());
  const [showBills, setShowBills] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = previewSetupDraft(draft);
  const { budget } = preview;
  const unpaidBills = draft.bills.filter((b) => b.status === "unpaid");
  const isShortfall = budget.kind === "shortfall";
  const isTight = budget.kind === "ok" && budget.dailyBudget < TIGHT_THRESHOLD_SATANG;

  async function handleStartCycle() {
    setBusy(true);
    setError(null);
    try {
      await api.createCycle(draftToNewCycleRequest(draft));
      clearSetupDraft();
      router.replace("/app?toast=saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกแผนไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  let paydayLabel = draft.payday;
  try {
    paydayLabel = formatThaiDate(draft.payday, "short");
  } catch {
    paydayLabel = draft.payday;
  }

  return (
    <SetupFrame
      step={5}
      title="ตรวจสรุปก่อนเริ่ม"
      subtitle="ตรวจสอบตัวเลขงบรายวันและเงินที่กันไว้ก่อนบันทึกแผนรอบนี้"
      backHref="/app/setup/essentials"
      currentPath="/app/setup/review"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 pt-1 text-center">
          <Mascot pose={isShortfall || isTight ? "budgetTight" : "budgetOk"} size={72} />
        </div>

        {isShortfall ? (
          <Banner
            kind="error"
            text={`เงินที่มีไม่พอหักบิลและเงินที่กันไว้ ขาดอีก ${formatBaht(budget.shortfall)} บาท`}
            action={{ label: "ปรับบิลหรือเงินออม", href: "/app/setup/balance" }}
          />
        ) : isTight ? (
          <Banner
            kind="warn"
            text="งบต่อวันต่ำกว่า 50 บาท ลองลดเป้าออมหรือเช็กว่ามีบิลที่จ่ายแยกแล้วหรือไม่"
            action={{ label: "กลับไปปรับ", href: "/app/setup/balance" }}
          />
        ) : null}

        <section className="flex flex-col gap-3 rounded-md border border-line-strong bg-card p-5">
          {budget.kind === "ok" ? (
            <>
              <span className="text-sm font-medium text-secondary">งบเฉลี่ยต่อวันในรอบนี้</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums text-primary">
                  {formatBaht(budget.dailyBudget)}
                </span>
                <span className="text-base font-semibold text-secondary">บาท/วัน</span>
              </div>
              <p className="text-xs text-secondary">
                รวม {budget.daysLeft} วัน จนถึงวันเงินเข้า ({paydayLabel})
              </p>
              {budget.maxPurchase !== null ? (
                <div className="mt-1 flex items-center justify-between rounded-sm bg-subtle px-3 py-2 text-sm">
                  <span className="text-secondary">ซื้อของก้อนใหญ่ได้ไม่เกิน</span>
                  <span className="font-semibold tabular-nums text-primary">
                    {formatBaht(budget.maxPurchase)} บาท
                  </span>
                </div>
              ) : null}
            </>
          ) : budget.kind === "shortfall" ? (
            <>
              <span className="text-sm font-medium text-status-danger">ยอดที่ขาดในรอบนี้</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums text-status-danger">
                  {formatBaht(budget.shortfall)}
                </span>
                <span className="text-base font-semibold text-status-danger">บาท</span>
              </div>
              <p className="text-xs text-secondary">
                อีก {budget.daysLeft} วันถึงวันเงินเข้า ({paydayLabel}) · แนะนำให้ปรับสถานะบิลหรือลดเงินที่กันไว้ก่อนเริ่มรอบ
              </p>
            </>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4 text-sm">
          <h2 className="text-base font-semibold text-primary">รายละเอียดการคำนวณ</h2>
          <div className="flex items-center justify-between">
            <span className="text-secondary">เงินที่มีตอนนี้</span>
            <span className="font-semibold tabular-nums text-primary">{formatBaht(draft.balance)} บาท</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowBills((v) => !v)}
                className="text-left font-medium text-link underline underline-offset-4"
              >
                หักบิล {unpaidBills.length} รายการ {showBills ? "▴" : "▾"}
              </button>
              <span className="font-semibold tabular-nums text-primary">
                −{formatBaht(preview.unpaidBillsTotal)} บาท
              </span>
            </div>
            {showBills && draft.bills.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-sm bg-subtle p-2.5 text-xs text-secondary">
                {draft.bills.map((b) => (
                  <li key={b.id} className="flex items-center justify-between">
                    <span>
                      {b.title} ({b.status === "unpaid" ? "ยังไม่จ่าย" : b.status === "paid" ? "จ่ายแล้ว" : "จ่ายแยก"})
                    </span>
                    <span className="tabular-nums">{formatBaht(b.amount)} บาท</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-secondary">เป้าออมรอบนี้</span>
            <span className="font-semibold tabular-nums text-primary">
              −{formatBaht(preview.savingsSatang)} บาท
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-secondary">เงินเผื่อฉุกเฉิน</span>
            <span className="font-semibold tabular-nums text-primary">
              −{formatBaht(draft.emergencyBuffer)} บาท
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-2">
            <span className="text-secondary">ค่าจำเป็นต่อวัน</span>
            <span className="font-semibold tabular-nums text-primary">
              {draft.essentialPerDay !== null ? `${formatBaht(draft.essentialPerDay)} บาท/วัน` : "ยังไม่ระบุ"}
            </span>
          </div>
        </section>

        {error ? (
          <p role="alert" className="rounded-sm bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button variant="primary" block busy={busy} onClick={handleStartCycle}>
            เริ่มใช้แผนนี้
          </Button>
          <Button variant="secondary" block onClick={() => router.push("/app/setup/balance")}>
            กลับไปแก้ยอดและบิล
          </Button>
        </div>
      </div>
    </SetupFrame>
  );
}
