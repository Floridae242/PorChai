"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { useApi } from "@/lib/client/use-api";
import { formatBaht } from "@/lib/format/money";
import type { SpendingInsights } from "@/lib/insights/types";

const weekdays = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export function InsightsView() {
  const api = useApi();
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(() => ({ api, attempt }), [api, attempt]);
  const [loaded, setLoaded] = useState<{
    key: typeof key;
    data: SpendingInsights | null;
    error: boolean;
  } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const aiLock = useRef(false);
  const currentKey = useRef(key);
  const data = loaded?.key === key ? loaded.data : null;
  const failed = loaded?.key === key && loaded.error;
  useEffect(() => {
    currentKey.current = key;
    let active = true;
    api
      .spendingInsights()
      .then((data) => {
        if (active) setLoaded({ key, data, error: false });
      })
      .catch(() => {
        if (active) setLoaded({ key, data: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [api, key]);
  async function explain() {
    if (aiLock.current) return;
    aiLock.current = true;
    setAiBusy(true);
    setAiMessage(null);
    try {
      const next = await api.spendingInsights(true);
      if (currentKey.current !== key) return;
      setLoaded({ key, data: next, error: false });
      if (!next.aiText)
        setAiMessage("ยังไม่มีคำอธิบาย AI เพิ่มเติม ดูข้อสังเกตจากรายการที่จดด้านล่างได้ครับ");
    } catch {
      if (currentKey.current === key)
        setAiMessage("ขอคำอธิบาย AI ไม่สำเร็จ ข้อมูลสรุปเดิมยังดูได้ ลองใหม่ได้ครับ");
    } finally {
      aiLock.current = false;
      setAiBusy(false);
    }
  }
  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="พฤติกรรมการใช้เงิน" back="/app/reports" tone="default" />
      <p className="text-sm leading-6 text-secondary">
        สรุปจากรายจ่ายที่คุณจด ไม่ใช่รายการทั้งหมดในบัญชีธนาคาร ยิ่งจดครบ ยิ่งเห็นภาพชัด
      </p>
      {failed ? (
        <>
          <Banner kind="error" text="โหลดข้อมูลพฤติกรรมไม่สำเร็จ" />
          <Button onClick={() => setAttempt((n) => n + 1)}>ลองใหม่</Button>
        </>
      ) : !data ? (
        <p role="status" aria-busy="true">
          กำลังสรุปรายการที่จด…
        </p>
      ) : (
        <>
          <p className="text-xs text-secondary">
            ช่วง 30 วัน: {data.from} – {data.until} (ไม่รวมวันสุดท้าย)
          </p>
          <dl className="grid grid-cols-3 gap-2">
            {[
              ["รายจ่ายที่จด", `${formatBaht(data.total)} บาท`],
              ["รายการ", `${data.count}`],
              ["วันที่มีรายจ่าย", `${data.activeDays} วัน`],
            ].map(([label, value]) => (
              <div
                className="rounded-md border border-line bg-card p-3"
                key={label}
              >
                <dt className="text-xs text-secondary">{label}</dt>
                <dd className="mt-2 break-words font-bold tabular-nums text-primary">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {data.count === 0 ? (
            <Banner
              kind="info"
              text="ยังไม่มีรายจ่ายที่จดในช่วงนี้ เริ่มจดแล้วกลับมาดูภาพรวมได้ครับ"
            />
          ) : (
            <p className="text-sm text-secondary">
              เฉลี่ยต่อรายการ {formatBaht(data.averagePerEntry)} บาท
            </p>
          )}
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="font-bold text-primary">เทียบช่วงละ 7 วัน</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-secondary">7 วันล่าสุด</dt>
                <dd className="font-bold tabular-nums">
                  {formatBaht(data.recentWeek)} บาท
                </dd>
              </div>
              <div>
                <dt className="text-secondary">7 วันก่อนหน้า</dt>
                <dd className="font-bold tabular-nums">
                  {formatBaht(data.previousWeek)} บาท
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-secondary">
              เปรียบเทียบจำนวนวันเท่ากัน ยอดต่ำลงอาจเกิดจากจดไม่ครบ
              ไม่ได้ยืนยันว่าใช้เงินจริงน้อยลง
            </p>
          </section>
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="font-bold text-primary">ข้อสังเกตจากข้อมูลที่จด</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-secondary">
              {data.observations.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
              {!data.observations.length && (
                <li>ยังมีข้อมูลไม่พอสำหรับข้อสังเกตเพิ่มเติม</li>
              )}
            </ul>
            <Button
              variant="secondary"
              busy={aiBusy}
              disabled={!data.count || aiBusy}
              onClick={explain}
            >
              ให้ AI ช่วยอธิบาย
            </Button>
            <p className="mt-2 text-xs text-secondary">
              ขอเมื่อคุณกดเท่านั้น AI ช่วยอธิบาย ไม่เปลี่ยนงบหรือบันทึกรายการให้เอง
            </p>
            {aiMessage && (
              <p role="status" className="mt-3 text-sm text-secondary">
                {aiMessage}
              </p>
            )}
            {data.aiText && (
              <p className="mt-4 whitespace-pre-wrap break-words rounded-sm bg-subtle p-3 text-sm leading-7 text-primary">
                {data.aiText}
              </p>
            )}
          </section>
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="font-bold text-primary">งบรายหมวดเดือนนี้</h2>
            <p className="mt-2 text-xs text-secondary">
              ตั้งแต่ {data.monthFrom} · หมวดหลักรวมหมวดย่อยแล้ว
              จึงไม่ควรนำสองระดับมาบวกซ้ำ
            </p>
            <ul className="mt-3 divide-y divide-line">
              {data.categories.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <strong>{c.label}</strong>
                    <span className="tabular-nums">
                      จด {formatBaht(c.spent)} บาท
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-secondary">
                    {c.monthlyBudget === null
                      ? "ยังไม่ตั้งงบ"
                      : `งบ ${formatBaht(c.monthlyBudget)} บาท · ${c.remaining !== null && c.remaining < 0 ? `เกิน ${formatBaht(-c.remaining)} บาท` : `เหลือ ${formatBaht(c.remaining ?? 0)} บาท`}`}
                  </p>
                </li>
              ))}
            </ul>
            <Link
              className={buttonClass("secondary")}
              href="/app/settings/categories"
            >
              จัดการหมวดและดูงบแนะนำ
            </Link>
          </section>
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="font-bold text-primary">วันในสัปดาห์ที่จด</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.weekdays.map((d) => (
                <li
                  className="flex flex-wrap justify-between gap-2"
                  key={d.day}
                >
                  <span>
                    {weekdays[d.day]} · {d.count} รายการ / {d.activeDays} วัน
                  </span>
                  <span className="tabular-nums">
                    {formatBaht(d.amount)} บาท
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-secondary">
              ยอดรวมตามวันที่จด ไม่ใช่ค่าเฉลี่ยต่อวันหรือข้อสรุปของทั้งสัปดาห์
            </p>
          </section>
          <section className="rounded-md border border-line bg-card p-4">
            <h2 className="font-bold text-primary">รายการลักษณะซ้ำ</h2>
            {!data.recurring.length ? (
              <p className="mt-3 text-sm text-secondary">
                ยังไม่พบรายการซ้ำที่มีข้อมูลเพียงพอ
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {data.recurring.map((r, i) => (
                  <li key={i} className="py-3 text-sm">
                    <strong className="break-words">{r.label}</strong>
                    <p className="mt-1 text-secondary">
                      {r.count} ครั้ง ใน {r.days} วัน · ยอดรวม{" "}
                      {formatBaht(r.amount)} บาท
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-secondary">
              รูปแบบจากข้อความที่จด ไม่ได้เปิดการเตือนหรือจดซ้ำให้อัตโนมัติ
            </p>
          </section>
        </>
      )}
      <Link href="/app/record/new" className={buttonClass("primary", true)}>
        จดรายจ่าย
      </Link>
    </main>
  );
}
