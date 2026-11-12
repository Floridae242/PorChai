"use client";

import { useState } from "react";
import { Sheet } from "@/components/shell/sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InputField } from "@/components/ui/input-field";
import type { Satang } from "@/lib/calc/money";
import type { BillStatus, DraftBill } from "@/lib/client/setup-draft";
import { bahtErrorMessage } from "@/lib/format/baht-error";
import { formatBaht, parseBahtInput } from "@/lib/format/money";

const STATUS_LABELS: Record<BillStatus, { short: string; detail: string }> = {
  unpaid: { short: "ยังไม่จ่าย", detail: "ยังไม่จ่าย · หักจากงบ" },
  paid: { short: "จ่ายแล้ว", detail: "จ่ายแล้ว · ไม่หัก" },
  separate: { short: "จ่ายแยก", detail: "จ่ายแยก · ไม่หัก" },
};

export interface BillsCardProps {
  bills: DraftBill[];
  unpaidBillsTotal: Satang;
  onAdd: (bill: Omit<DraftBill, "id">) => void;
  onUpdate: (bill: DraftBill) => void;
  onDelete: (id: string) => void;
}

export function BillsCard({ bills, unpaidBillsTotal, onAdd, onUpdate, onDelete }: BillsCardProps) {
  const [sheetMode, setSheetMode] = useState<{ kind: "closed" } | { kind: "add" } | { kind: "edit"; bill: DraftBill }>({
    kind: "closed",
  });
  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [status, setStatus] = useState<BillStatus>("unpaid");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  function clearErrors() {
    setTitleError(null);
    setAmountError(null);
  }

  function openAdd() {
    setTitle("");
    setAmountText("");
    setStatus("unpaid");
    clearErrors();
    setSheetMode({ kind: "add" });
  }

  function openEdit(bill: DraftBill) {
    setTitle(bill.title);
    setAmountText(formatBaht(bill.amount).replace(/,/g, ""));
    setStatus(bill.status);
    clearErrors();
    setSheetMode({ kind: "edit", bill });
  }

  function closeSheet() {
    setSheetMode({ kind: "closed" });
    clearErrors();
  }

  function handleSave() {
    const cleanTitle = title.trim();
    const parsed = parseBahtInput(amountText);
    setTitleError(cleanTitle ? null : "กรุณาใส่ชื่อบิล");
    setAmountError(parsed.ok ? null : bahtErrorMessage(parsed.reason));
    if (!cleanTitle || !parsed.ok) return;
    if (sheetMode.kind === "add") {
      onAdd({ title: cleanTitle, amount: parsed.satang, status });
    } else if (sheetMode.kind === "edit") {
      onUpdate({ id: sheetMode.bill.id, title: cleanTitle, amount: parsed.satang, status });
    }
    closeSheet();
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-primary">บิลประจำในรอบนี้</h2>
          <p className="text-xs text-secondary">หักเฉพาะบิลที่ยังไม่จ่ายออกจากงบก่อนหารรายวัน</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-pill border border-line-strong bg-subtle px-3 py-1.5 text-xs font-semibold text-link"
        >
          + เพิ่มบิล
        </button>
      </div>

      {bills.length === 0 ? (
        <p className="py-2 text-sm text-muted">ยังไม่มีบิลที่ตั้งไว้ กด + เพิ่มบิล หรือข้ามไปขั้นถัดไปได้</p>
      ) : (
        <ul className="divide-y divide-line">
          {bills.map((bill) => (
            <li key={bill.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{bill.title}</p>
                <p className="text-xs text-secondary">{STATUS_LABELS[bill.status].detail}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {formatBaht(bill.amount)} บาท
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(bill)}
                  aria-label={`แก้ไข ${bill.title}`}
                  className="rounded-sm border border-line px-2.5 py-1 text-xs font-semibold text-link"
                >
                  แก้ไข
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
        <span className="text-secondary">รวมบิลที่หักรอบนี้</span>
        <span className="font-semibold tabular-nums text-primary">{formatBaht(unpaidBillsTotal)} บาท</span>
      </div>

      <Sheet
        open={sheetMode.kind !== "closed"}
        onClose={closeSheet}
        title={sheetMode.kind === "edit" ? "แก้ไขบิล" : "เพิ่มบิล"}
      >
        <div className="flex flex-col gap-4">
          <InputField
            label="ชื่อบิล"
            placeholder="เช่น ค่าหอ, ค่าน้ำ, ค่าเน็ต"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            state={titleError ? "error" : title ? "filled" : "default"}
            helper={titleError ?? undefined}
          />
          <InputField
            label="จำนวนเงิน (บาท)"
            inputMode="decimal"
            placeholder="เช่น 400"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            state={amountError ? "error" : amountText ? "filled" : "default"}
            helper={amountError ?? undefined}
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-primary">สถานะบิล</span>
            <div className="flex flex-wrap gap-2">
              {(["unpaid", "paid", "separate"] as const).map((s) => (
                <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>
                  {STATUS_LABELS[s].short}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button variant="primary" block onClick={handleSave}>
              บันทึก
            </Button>
            {sheetMode.kind === "edit" ? (
              <Button
                variant="secondary"
                block
                onClick={() => {
                  onDelete(sheetMode.bill.id);
                  closeSheet();
                }}
              >
                ลบบิลนี้
              </Button>
            ) : null}
            <Button variant="ghost" block onClick={closeSheet}>
              ยกเลิก
            </Button>
          </div>
        </div>
      </Sheet>
    </section>
  );
}
