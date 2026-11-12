"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/chip";
import { InputField } from "@/components/ui/input-field";
import type { Satang } from "@/lib/calc/money";
import { formatBaht, parseBahtInput } from "@/lib/format/money";

export interface SavingsPickerProps {
  mode: "percent" | "amount" | "none";
  percent: number;
  savingsSatang: Satang;
  percentOptions: { p10: Satang; p20: Satang; p30: Satang };
  onChangePercent: (pct: number) => void;
  onChangeAmount: (satang: Satang) => void;
  onClear: () => void;
}

export function SavingsPicker({
  mode,
  percent,
  savingsSatang,
  percentOptions,
  onChangePercent,
  onChangeAmount,
  onClear,
}: SavingsPickerProps) {
  const [customText, setCustomText] = useState(() =>
    mode === "amount" && savingsSatang > 0 ? formatBaht(savingsSatang).replace(/,/g, "") : "",
  );
  const [customError, setCustomError] = useState<string | null>(null);

  const presets: { pct: number; satang: Satang }[] = [
    { pct: 10, satang: percentOptions.p10 },
    { pct: 20, satang: percentOptions.p20 },
    { pct: 30, satang: percentOptions.p30 },
  ];

  function handleCustomInput(val: string) {
    setCustomText(val);
    if (!val.trim()) {
      setCustomError(null);
      return;
    }
    const parsed = parseBahtInput(val);
    if (!parsed.ok) {
      setCustomError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setCustomError(null);
    onChangeAmount(parsed.satang);
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
      <div>
        <h2 className="text-base font-semibold text-primary">① เป้าออมรอบนี้</h2>
        <p className="text-xs text-secondary">หักไว้ตั้งแต่ต้นรอบ แอปจะไม่ดึงเงินออมมาใช้คำนวณซื้อของ</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Chip
            key={p.pct}
            selected={mode === "percent" && percent === p.pct}
            onClick={() => {
              setCustomError(null);
              onChangePercent(p.pct);
            }}
          >
            {p.pct}% ({formatBaht(p.satang)} บาท)
          </Chip>
        ))}
        <Chip
          selected={mode === "amount"}
          onClick={() => {
            onChangeAmount(savingsSatang > 0 ? savingsSatang : percentOptions.p10);
          }}
        >
          กำหนดเอง
        </Chip>
        <Chip
          selected={mode === "none"}
          onClick={() => {
            setCustomError(null);
            onClear();
          }}
        >
          ยังไม่ตั้ง
        </Chip>
      </div>

      {mode === "amount" ? (
        <InputField
          label="จำนวนเงินออม (บาท)"
          inputMode="decimal"
          placeholder="เช่น 240"
          value={customText}
          onChange={(e) => handleCustomInput(e.target.value)}
          state={customError ? "error" : customText ? "filled" : "default"}
          helper={customError ?? undefined}
        />
      ) : null}

      <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
        <span className="text-secondary">ยอดออมรอบนี้</span>
        <span className="font-semibold tabular-nums text-primary">{formatBaht(savingsSatang)} บาท</span>
      </div>
    </section>
  );
}

export interface BufferCardProps {
  bufferSatang: Satang;
  onChangeBuffer: (satang: Satang) => void;
}

const BUFFER_PRESETS: Satang[] = [0, 12000, 30000];

export function BufferCard({ bufferSatang, onChangeBuffer }: BufferCardProps) {
  const isPreset = BUFFER_PRESETS.includes(bufferSatang);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [customText, setCustomText] = useState(() =>
    bufferSatang > 0 ? formatBaht(bufferSatang).replace(/,/g, "") : "",
  );
  const [error, setError] = useState<string | null>(null);

  function handleCustom(val: string) {
    setCustomText(val);
    if (!val.trim() || val.trim() === "0") {
      setError(null);
      onChangeBuffer(0);
      return;
    }
    const parsed = parseBahtInput(val);
    if (!parsed.ok) {
      setError("ใส่เป็นตัวเลขมากกว่าหรือเท่ากับ 0");
      return;
    }
    setError(null);
    onChangeBuffer(parsed.satang);
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
      <div>
        <h2 className="text-base font-semibold text-primary">② เงินเผื่อฉุกเฉิน</h2>
        <p className="text-xs text-secondary">กันไว้เผื่อเหตุจำเป็น ไม่นำมารวมในงบใช้จ่ายรายวัน</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BUFFER_PRESETS.map((preset) => (
          <Chip
            key={preset}
            selected={!customOpen && bufferSatang === preset}
            onClick={() => {
              setCustomOpen(false);
              setError(null);
              onChangeBuffer(preset);
            }}
          >
            {preset === 0 ? "ไม่กัน" : `${formatBaht(preset)} บาท`}
          </Chip>
        ))}
        <Chip
          selected={customOpen}
          onClick={() => {
            setCustomOpen(true);
            setCustomText(bufferSatang > 0 ? formatBaht(bufferSatang).replace(/,/g, "") : "");
          }}
        >
          กำหนดเอง
        </Chip>
      </div>

      {customOpen ? (
        <InputField
          label="จำนวนเงินเผื่อ (บาท)"
          inputMode="decimal"
          placeholder="เช่น 120"
          value={customText}
          onChange={(e) => handleCustom(e.target.value)}
          state={error ? "error" : customText ? "filled" : "default"}
          helper={error ?? undefined}
        />
      ) : null}

      <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
        <span className="text-secondary">เงินเผื่อรอบนี้</span>
        <span className="font-semibold tabular-nums text-primary">{formatBaht(bufferSatang)} บาท</span>
      </div>
    </section>
  );
}

export interface EssentialPickerProps {
  essentialPerDay: Satang | null;
  note: string;
  onChangeEssential: (satang: Satang | null) => void;
  onChangeNote: (note: string) => void;
}

const ESSENTIAL_PRESETS: Satang[] = [6000, 7000, 10000];

export function EssentialPicker({
  essentialPerDay,
  note,
  onChangeEssential,
  onChangeNote,
}: EssentialPickerProps) {
  const [text, setText] = useState(() =>
    essentialPerDay !== null && essentialPerDay > 0 ? formatBaht(essentialPerDay).replace(/,/g, "") : "",
  );
  const [error, setError] = useState<string | null>(null);

  function selectPreset(satang: Satang) {
    setText(formatBaht(satang).replace(/,/g, ""));
    setError(null);
    onChangeEssential(satang);
  }

  function handleText(val: string) {
    setText(val);
    if (!val.trim()) {
      setError(null);
      onChangeEssential(null);
      return;
    }
    const parsed = parseBahtInput(val);
    if (!parsed.ok) {
      setError("ใส่เป็นตัวเลขมากกว่า 0");
      return;
    }
    setError(null);
    onChangeEssential(parsed.satang);
  }

  return (
    <section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
      <div>
        <h2 className="text-base font-semibold text-primary">ค่าใช้จ่ายจำเป็นต่อวัน</h2>
        <p className="text-xs text-secondary">
          ใช้คำนวณวงเงิน &quot;ซื้อได้ไม่เกิน&quot; ตอนลองก่อนจ่าย เพื่อไม่ให้กระทบค่ากินและค่าเดินทางทุกวัน
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ESSENTIAL_PRESETS.map((p) => (
          <Chip key={p} selected={essentialPerDay === p} onClick={() => selectPreset(p)}>
            {formatBaht(p)} บาท/วัน
          </Chip>
        ))}
      </div>

      <InputField
        label="ยอดต่อวัน (บาท)"
        inputMode="decimal"
        placeholder="เช่น 70"
        value={text}
        onChange={(e) => handleText(e.target.value)}
        state={error ? "error" : text ? "filled" : "default"}
        helper={error ?? "ถ้ายังไม่แน่ใจ ข้ามไปตั้งทีหลังได้"}
      />

      <InputField
        label="ใช้กับอะไรบ้าง (ไม่บังคับ)"
        placeholder="เช่น ค่าข้าว + ค่ารถ"
        value={note}
        onChange={(e) => onChangeNote(e.target.value)}
        state={note ? "filled" : "default"}
      />
    </section>
  );
}
