"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BillsCard } from "@/components/setup/bills-card";
import { BufferCard, EssentialPicker, SavingsPicker } from "@/components/setup/savings-picker";
import { AppHeader } from "@/components/shell/app-header";
import { useToast } from "@/components/shell/toast";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InputField } from "@/components/ui/input-field";
import { ListRow } from "@/components/ui/list-row";
import { Mascot } from "@/components/ui/mascot";
import { USER_CATEGORIES } from "@/lib/api-types";
import { CONSENT_STORAGE_KEY } from "@/lib/client/consent-fallback";
import {
  clearSetupDraft,
  loadSetupDraft,
  percentOptionsOf,
  saveSetupDraft,
  savingsSatangOf,
  unpaidBillsTotal,
  type SetupDraft,
} from "@/lib/client/setup-draft";
import { CATEGORY_LABELS } from "@/lib/client/category-labels";
import { useApi } from "@/lib/client/use-api";

export function SettingsMainView() {
  return (
    <main className="flex flex-col gap-4 py-4 font-body">
      <div
        style={{ backgroundImage: "var(--hero-gradient)" }}
        className="flex flex-col gap-2 rounded-md px-5 py-4 text-on-hero"
      >
        <AppHeader title="ตั้งค่า" tone="onDark" />
        <p className="text-xs text-white/85">จัดการการเตือน บิลประจำ เป้าออม และความเป็นส่วนตัวของคุณ</p>
      </div>

      <section className="flex items-center justify-between gap-3 rounded-md border border-line-strong bg-accent-reward-bg p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-primary">พอใช้ Plus</span>
          <p className="text-xs text-secondary">เก็บของไว้ในแผนได้ไม่จำกัดรายการ และเปรียบเทียบหลายทางเลือก</p>
        </div>
        <Link href="/app/plus" className="rounded-pill bg-action-primary px-3.5 py-1.5 text-xs font-semibold text-on-action">
          ดู Plus ›
        </Link>
      </section>

      <section className="divide-y divide-line rounded-md border border-line bg-card px-4">
        <ListRow
          title="การเตือนรายวันและบิล"
          subtitle="ตั้งเวลาเตือนรายการประจำ หยุดพัก หรือปิดการเตือน"
          href="/app/settings/notifications"
        />
        <ListRow
          title="บิลประจำในรอบนี้"
          subtitle="เพิ่ม แก้ไข หรือเปลี่ยนสถานะบิล (จ่ายแยก / จ่ายแล้ว)"
          href="/app/settings/bills"
        />
        <ListRow
          title="เงินออม เงินเผื่อ และค่าจำเป็น"
          subtitle="ปรับเป้าออม เงินเผื่อฉุกเฉิน และค่าใช้จ่ายจำเป็นต่อวัน"
          href="/app/settings/savings"
        />
        <ListRow
          title="รอบเงินและวันเงินเข้า"
          subtitle="ปรับยอดเงินจริง หรือเปลี่ยนวันเงินเข้า"
          href="/app/plan/edit"
        />
        <ListRow
          title="หมวดหมู่ของฉัน"
          subtitle="ดูและเพิ่มหมวดหมู่สำหรับจดรายการ"
          href="/app/settings/categories"
        />
        <ListRow
          title="ความเป็นส่วนตัวและการใช้ข้อมูล"
          subtitle="รายละเอียดการเก็บข้อมูล OCR และ AI"
          href="/app/settings/privacy"
        />
        <ListRow
          title="ลบข้อมูลทั้งหมด"
          subtitle="ล้างข้อมูลรายรับรายจ่ายและเริ่มตั้งค่าใหม่"
          href="/app/settings/delete"
        />
      </section>
    </main>
  );
}

export function SettingsNotificationsView() {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(true);
  const [lunchTime, setLunchTime] = useState("12:30");
  const [billReminder, setBillReminder] = useState(true);
  const [paydayReminder, setPaydayReminder] = useState(true);
  const [pauseDays, setPauseDays] = useState<0 | 1 | 3 | 7>(0);

  function handleSave() {
    toast.show("บันทึกการตั้งค่าการเตือนแล้ว", { mascot: "reminder" });
    router.push("/app/settings");
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ตั้งค่าการเตือน" back="/app/settings" tone="default" />

      <div className="flex items-center gap-3 rounded-md border border-line bg-subtle p-4">
        <Mascot pose="reminder" size={64} />
        <div className="flex flex-col gap-0.5 text-sm">
          <p className="font-semibold text-primary">เตือนตามพฤติกรรมจริงของคุณ</p>
          <p className="text-xs text-secondary">
            ระบบจะถามเฉพาะรายการที่เกิดซ้ำอย่างน้อย 3 วัน และยังไม่เห็นคุณจดในวันนั้น
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <label className="flex cursor-pointer items-center justify-between text-sm font-semibold text-primary">
          <span>เปิดการเตือนผ่าน LINE OA</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-5 accent-[var(--green-700)]"
          />
        </label>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-xs font-semibold text-secondary">หยุดพักการเตือนชั่วคราว</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { days: 0, label: "ไม่หยุด" },
                { days: 1, label: "หยุด 1 วัน" },
                { days: 3, label: "หยุด 3 วัน" },
                { days: 7, label: "หยุด 7 วัน" },
              ] as const
            ).map((p) => (
              <Chip key={p.days} selected={pauseDays === p.days} onClick={() => setPauseDays(p.days)}>
                {p.label}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">รายการประจำที่ระบบตรวจพบ</h2>

        <div className="flex items-center justify-between rounded-sm bg-subtle p-3 text-sm">
          <div>
            <p className="font-semibold text-primary">ข้าวเที่ยง ~50 บาท</p>
            <p className="text-xs text-status-ok">ประวัติยืนยันแล้ว 5 วัน · พร้อมเตือนเมื่อลืมจด</p>
          </div>
          <input
            type="time"
            aria-label="เวลาเตือนข้าวเที่ยง"
            value={lunchTime}
            onChange={(e) => setLunchTime(e.target.value)}
            className="rounded-sm border border-line bg-card px-2 py-1 text-xs font-semibold text-primary"
          />
        </div>

        <div className="flex items-center justify-between rounded-sm border border-line p-3 text-sm">
          <div>
            <p className="font-semibold text-primary">ค่ารถ ~20 บาท</p>
            <p className="text-xs text-secondary">ยังไม่ครบ 3 วัน (ยืนยันแล้ว 2/3 วัน · ยังไม่ส่งเตือน)</p>
          </div>
          <span className="text-xs text-muted">รอครบ 3 วัน</span>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4 text-sm">
        <h2 className="text-base font-semibold text-primary">การเตือนรอบเงินและบิล</h2>
        <label className="flex cursor-pointer items-center justify-between">
          <span className="text-primary">เตือนบิลประจำก่อนครบกำหนด 1 วัน</span>
          <input
            type="checkbox"
            checked={billReminder}
            onChange={(e) => setBillReminder(e.target.checked)}
            className="size-5 accent-[var(--green-700)]"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between">
          <span className="text-primary">ถามเมื่อถึงวันเงินเข้าหรือวันรับเงินเลื่อน</span>
          <input
            type="checkbox"
            checked={paydayReminder}
            onChange={(e) => setPaydayReminder(e.target.checked)}
            className="size-5 accent-[var(--green-700)]"
          />
        </label>
      </section>

      <Button variant="primary" block onClick={handleSave}>
        บันทึกการตั้งค่า
      </Button>
    </main>
  );
}

export function SettingsBillsView() {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<SetupDraft>(() => loadSetupDraft());
  function handleSave() {
    saveSetupDraft(draft);
    toast.show("บันทึกบิลประจำแล้ว", { mascot: "budgetOk" });
    router.push("/app/settings");
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="บิลประจำ" back="/app/settings" tone="default" />

      <BillsCard
        bills={draft.bills}
        unpaidBillsTotal={unpaidBillsTotal(draft)}
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

      <Button variant="primary" block onClick={handleSave}>
        บันทึกบิลประจำ
      </Button>
    </main>
  );
}

export function SettingsSavingsView() {
  const api = useApi();
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<SetupDraft>(() => loadSetupDraft());
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      saveSetupDraft(draft);
      if (draft.essentialPerDay !== null) {
        await api.setEssentials({ food: draft.essentialPerDay, transport: 0 }).catch(() => {});
      }
      toast.show("บันทึกเงินออม เงินเผื่อ และค่าจำเป็นแล้ว", { mascot: "saveCoins" });
      router.push("/app/plan?tab=savings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="เงินออม เงินเผื่อ และค่าจำเป็น" back="/app/settings" tone="default" />

      <SavingsPicker
        mode={draft.savingsMode}
        percent={draft.savingsPercent}
        savingsSatang={savingsSatangOf(draft)}
        percentOptions={percentOptionsOf(draft.balance)}
        onChangePercent={(pct) => setDraft((d) => ({ ...d, savingsMode: "percent", savingsPercent: pct }))}
        onChangeAmount={(satang) => setDraft((d) => ({ ...d, savingsMode: "amount", savingsAmount: satang }))}
        onClear={() => setDraft((d) => ({ ...d, savingsMode: "none", savingsAmount: 0 }))}
      />

      <BufferCard
        bufferSatang={draft.emergencyBuffer}
        onChangeBuffer={(satang) => setDraft((d) => ({ ...d, emergencyBuffer: satang }))}
      />

      <EssentialPicker
        essentialPerDay={draft.essentialPerDay}
        note={draft.essentialNote}
        onChangeEssential={(satang) => setDraft((d) => ({ ...d, essentialPerDay: satang }))}
        onChangeNote={(note) => setDraft((d) => ({ ...d, essentialNote: note }))}
      />

      <Button variant="primary" block busy={busy} onClick={handleSave}>
        บันทึกการเปลี่ยนแปลง
      </Button>
    </main>
  );
}

export function SettingsCategoriesView() {
  const toast = useToast();
  const [customCats, setCustomCats] = useState<string[]>(["เรียน", "สังสรรค์"]);
  const [newName, setNewName] = useState("");

  function handleAdd() {
    const clean = newName.trim();
    if (!clean) return;
    setCustomCats((prev) => [...prev, clean]);
    setNewName("");
    toast.show(`เพิ่มหมวด "${clean}" แล้ว`);
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="หมวดหมู่ของฉัน" back="/app/settings" tone="default" />

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold text-primary">หมวดหมู่หลัก</h2>
        <div className="flex flex-wrap gap-2">
          {USER_CATEGORIES.map((c) => (
            <Chip key={c} selected>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
          {customCats.map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
        <InputField
          label="สร้างหมวดหมู่เพิ่มเติม"
          placeholder="เช่น อุปกรณ์การเรียน, สัตว์เลี้ยง"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          state={newName ? "filled" : "default"}
        />
        <Button variant="secondary" disabled={!newName.trim()} onClick={handleAdd}>
          + เพิ่มหมวดหมู่
        </Button>
      </section>
    </main>
  );
}

export function SettingsPrivacyView() {
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ความเป็นส่วนตัวและการใช้ข้อมูล" back="/app/settings" tone="default" />

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-4 text-sm">
        <h2 className="text-base font-semibold text-primary">หลักการดูแลข้อมูลของพอใช้</h2>
        <ul className="flex flex-col gap-2 text-secondary">
          <li>• ข้อมูลรายรับรายจ่ายและแผนเงินใช้คำนวณงบรายวันของคุณเท่านั้น</li>
          <li>• รูปใบเสร็จ/สลิป (OCR) จะสร้างเป็นรายการร่างให้คุณตรวจยืนยันก่อนเสมอ</li>
          <li>• ตัวเลขเงินทุกตัวคำนวณด้วยโค้ด ไม่ใช้ AI คิดเลข</li>
          <li>• ข้อมูลที่แสดงให้ร้านค้าผู้สนับสนุนเป็นสถิติรวมแบบไม่ระบุตัวตน</li>
        </ul>
      </section>

      <Link href="/app/settings" className={buttonClass("primary", true)}>
        เข้าใจแล้ว
      </Link>
    </main>
  );
}

export function SettingsDeleteView() {
  const router = useRouter();

  function handleDeleteAll() {
    clearSetupDraft();
    try {
      window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // ignore
    }
    router.replace("/app/consent");
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="ลบข้อมูลทั้งหมด" back="/app/settings" tone="default" />

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-5">
        <h2 className="text-lg font-bold text-status-danger">ยืนยันลบข้อมูลทั้งหมดหรือไม่</h2>
        <p className="text-sm text-secondary">
          การลบข้อมูลจะล้างรอบเงิน รายการรายรับรายจ่าย แผนที่เก็บไว้ และการยินยอมทั้งหมด
          และจะพาคุณกลับไปยังหน้าเริ่มต้นใหม่ (A1)
        </p>

        <div className="flex flex-col gap-2 pt-2">
          <Button variant="primary" block onClick={handleDeleteAll}>
            ยืนยันลบข้อมูลทั้งหมด
          </Button>
          <Link href="/app/settings" className={buttonClass("ghost", true)}>
            ยกเลิก
          </Link>
        </div>
      </section>
    </main>
  );
}
