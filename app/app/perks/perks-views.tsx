"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { useToast } from "@/components/shell/toast";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { Mascot } from "@/components/ui/mascot";
import { ApiError } from "@/lib/client/errors";
import { PROMO_FIXTURES } from "@/lib/client/mock-fixtures";
import type { Promo, Reward } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { formatThaiDate } from "@/lib/format/date";
import { formatBaht } from "@/lib/format/money";

export function PerksListView() {
  const api = useApi();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [points, setPoints] = useState<{ balance: number; claimedToday: boolean }>({
    balance: 11,
    claimedToday: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.promos().catch(() => [] as Promo[]),
      api.points().catch(() => ({ balance: 11, claimedToday: false })),
    ])
      .then(([pList, pts]) => {
        setPromos(pList);
        setPoints(pts);
      })
      .finally(() => setLoading(false));
  }, [api]);

  return (
    <main className="flex flex-col gap-4 py-4 font-body">
      <div
        style={{ backgroundImage: "var(--hero-gradient)" }}
        className="flex flex-col gap-3 rounded-md px-5 py-4 text-on-hero"
      >
        <AppHeader title="สิทธิพิเศษ & แต้ม" tone="onDark" />
        <div className="flex items-center justify-between rounded-sm bg-white/15 p-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-white/85">แต้มสะสมของคุณ</span>
            <span className="text-2xl font-bold tabular-nums text-on-hero">{points.balance} แต้ม</span>
          </div>
          <Link
            href="/app/points"
            className="rounded-pill bg-accent-reward px-4 py-2 text-xs font-bold text-primary"
          >
            แลกของรางวัล ›
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="py-6 text-sm text-secondary" aria-busy="true">
          กำลังโหลดสิทธิพิเศษ…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {promos.map((promo) => (
            <article
              key={promo.id}
              className="flex flex-col gap-3 rounded-md border border-line bg-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-pill bg-subtle px-2.5 py-0.5 text-[11px] font-semibold text-link">
                  ข้อเสนอจากผู้สนับสนุน
                </span>
                <span className="text-xs text-secondary">{promo.validDays}</span>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-secondary">{promo.shop}</p>
                  <h2 className="text-base font-semibold text-primary">{promo.title}</h2>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold tabular-nums text-primary">
                    {formatBaht(promo.price)}
                  </span>
                  <span className="ml-1 text-xs text-secondary">บาท</span>
                </div>
              </div>

              {promo.fitsBudget !== null && promo.leftAfter !== null ? (
                <div
                  className={`rounded-sm px-3 py-2 text-xs font-medium ${
                    promo.fitsBudget
                      ? "bg-status-ok-bg text-status-ok"
                      : "bg-status-warn-bg text-status-warn"
                  }`}
                >
                  {promo.fitsBudget
                    ? `อยู่ในงบวันนี้ · ซื้อแล้วเหลือใช้อีก ${formatBaht(promo.leftAfter)} บาท`
                    : `เกินงบวันนี้ ${formatBaht(-promo.leftAfter)} บาท · ลองเช็กผลกระทบก่อนได้`}
                </div>
              ) : null}

              <Link href={`/app/perks/${promo.id}`} className={buttonClass("secondary", true)}>
                ดูรายละเอียดและรับสิทธิ์
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

export function PerkDetailView() {
  const api = useApi();
  const params = useParams<{ id: string }>();
  const promoId = params?.id ?? PROMO_FIXTURES[0].id;
  const [promo, setPromo] = useState<Promo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .promo(promoId)
      .then(setPromo)
      .catch(() => setPromo(null))
      .finally(() => setLoading(false));
  }, [api, promoId]);

  if (loading) {
    return (
      <main className="py-8 font-body text-sm text-secondary" aria-busy="true">
        กำลังโหลดรายละเอียด…
      </main>
    );
  }

  if (!promo) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="รายละเอียดสิทธิพิเศษ" back="/app/perks" tone="default" />
        <Banner kind="error" text="ไม่พบโปรโมชันนี้" />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="รายละเอียดสิทธิพิเศษ" back="/app/perks" tone="default" />

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-5">
        <span className="self-start rounded-pill bg-subtle px-2.5 py-0.5 text-xs font-semibold text-link">
          ข้อเสนอจากผู้สนับสนุน
        </span>
        <div>
          <p className="text-sm text-secondary">{promo.shop}</p>
          <h2 className="text-xl font-bold text-primary">{promo.title}</h2>
        </div>

        <div className="flex items-baseline gap-1.5 border-y border-line py-3">
          <span className="text-3xl font-bold tabular-nums text-primary">{formatBaht(promo.price)}</span>
          <span className="text-sm font-semibold text-secondary">บาท · ใช้ได้ {promo.validDays}</span>
        </div>

        {promo.fitsBudget !== null && promo.leftAfter !== null ? (
          <div
            className={`rounded-sm p-3 text-sm ${
              promo.fitsBudget ? "bg-status-ok-bg text-status-ok" : "bg-status-warn-bg text-status-warn"
            }`}
          >
            {promo.fitsBudget
              ? `✓ เทียบกับงบวันนี้ของคุณ: ซื้อ ${formatBaht(promo.price)} บาท แล้วยังเหลือใช้วันนี้อีก ${formatBaht(promo.leftAfter)} บาท`
              : `⚠ เทียบกับงบวันนี้ของคุณ: เกินงบวันนี้ ${formatBaht(-promo.leftAfter)} บาท`}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 pt-1 text-sm">
          <h3 className="font-semibold text-primary">เงื่อนไขการใช้สิทธิ์</h3>
          <ul className="list-inside list-disc text-xs text-secondary">
            {promo.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
            <li>แสดงรหัสหรือ QR ให้ร้านค้ากดยืนยันตอนชำระเงิน</li>
          </ul>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <Link href={`/app/perks/${promo.id}/code`} className={buttonClass("primary", true)}>
          รับรหัสใช้สิทธิ์
        </Link>
        <Link
          href={`/app/try/result?title=${encodeURIComponent(promo.title)}&amount=${formatBaht(promo.price).replace(/,/g, "")}`}
          className={buttonClass("secondary", true)}
        >
          ลองคำนวณในลองก่อนจ่าย
        </Link>
      </div>
    </main>
  );
}

export function PerkCodeView() {
  const api = useApi();
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const promoId = params?.id ?? PROMO_FIXTURES[0].id;

  const [promo, setPromo] = useState<Promo | null>(null);
  const [claim, setClaim] = useState<{ code: string; expiresAt: string } | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.promo(promoId), api.claimPromo(promoId)])
      .then(([p, c]) => {
        setPromo(p);
        setClaim(c);
      })
      .catch(() => {});
  }, [api, promoId]);

  async function handleRecordSpend() {
    if (!promo || busy) return;
    setBusy(true);
    try {
      await api.addEntry(
        {
          amount: promo.price,
          category: "food",
          note: `${promo.shop} (${promo.title})`,
        },
        `promo-spend-${claim?.code ?? promo.id}`,
      );
      setRecorded(true);
      toast.show(`บันทึกรายจ่าย ${formatBaht(promo.price)} บาทแล้ว`, { mascot: "reward" });
    } finally {
      setBusy(false);
    }
  }

  let expiryText = claim?.expiresAt ?? "";
  if (claim?.expiresAt) {
    try {
      expiryText = formatThaiDate(claim.expiresAt, "long");
    } catch {
      expiryText = claim.expiresAt;
    }
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="รหัสใช้สิทธิ์" back={`/app/perks/${promoId}`} tone="default" />

      {recorded ? (
        <section className="flex flex-col items-center gap-4 rounded-md border border-line-strong bg-card p-6 text-center">
          <Mascot pose="reward" size={80} />
          <h2 className="font-display text-3xl text-primary">ใช้สิทธิ์และจดรายจ่ายแล้ว ✓</h2>
          <p className="text-sm text-secondary">
            บันทึกค่าใช้จ่าย {promo ? `${formatBaht(promo.price)} บาท` : ""} เข้ารอบเงินปัจจุบันเรียบร้อยแล้ว
          </p>
          <Link href="/app" className={buttonClass("primary", true)}>
            กลับหน้าสรุป
          </Link>
        </section>
      ) : (
        <>
          <section className="flex flex-col items-center gap-4 rounded-md border border-line-strong bg-card p-6 text-center">
            <span className="rounded-pill bg-subtle px-3 py-1 text-xs font-semibold text-link">
              ข้อเสนอจากผู้สนับสนุน
            </span>
            <div>
              <p className="text-xs text-secondary">{promo?.shop}</p>
              <h2 className="text-lg font-bold text-primary">{promo?.title}</h2>
            </div>

            <div
              aria-label="QR Code สำหรับร้านค้า"
              className="flex size-40 flex-col items-center justify-center rounded-md border-2 border-dashed border-line-strong bg-subtle p-4"
            >
              <span className="font-mono text-2xl font-bold tracking-wider text-primary">
                {claim?.code ?? "PC-...."}
              </span>
              <span className="mt-1 text-[11px] text-secondary">แสดงรหัสนี้ให้ร้านค้า</span>
            </div>

            <p className="text-xs text-secondary">ใช้ได้ถึง {expiryText}</p>
          </section>

          <div className="flex flex-col gap-2">
            <Button variant="primary" block busy={busy} onClick={handleRecordSpend}>
              {promo
                ? `ใช้สิทธิ์แล้ว · จดรายจ่าย ${formatBaht(promo.price)} บาท`
                : "ใช้สิทธิ์แล้ว · จดรายจ่าย"}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}

export function PointsView() {
  const api = useApi();
  const toast = useToast();
  const [points, setPoints] = useState<{ balance: number; claimedToday: boolean }>({
    balance: 11,
    claimedToday: false,
  });
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redeemedCode, setRedeemedCode] = useState<{ rewardName: string; code: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    Promise.all([api.points(), api.rewards()])
      .then(([pts, rws]) => {
        setPoints(pts);
        setRewards(rws);
      })
      .catch(() => {});
  }, [api]);

  async function handleRedeem(reward: Reward) {
    setBusyId(reward.id);
    setError(null);
    seq.current += 1;
    try {
      const res = await api.redeemReward(reward.id, `redeem-${reward.id}-${seq.current}`);
      setPoints((prev) => ({ ...prev, balance: res.balance }));
      setRewards((prev) => prev.map((r) => (r.id === reward.id ? { ...r, stock: Math.max(0, r.stock - 1) } : r)));
      setRedeemedCode({ rewardName: reward.name, code: res.code });
      toast.show(`แลก ${reward.name} สำเร็จ!`, { mascot: "reward" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "แลกของรางวัลไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="แต้มของฉัน & แลกของรางวัล" back="/app/perks" tone="default" />

      <section className="flex items-center justify-between rounded-md border border-line bg-accent-reward-bg p-5">
        <div>
          <span className="text-xs font-semibold text-secondary">แต้มสะสมปัจจุบัน</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold tabular-nums text-primary">{points.balance}</span>
            <span className="text-sm font-semibold text-primary">แต้ม</span>
          </div>
          <p className="mt-1 text-xs text-secondary">กด &quot;รับแต้มฟรี&quot; ที่หน้าสรุปได้วันละ 1 แต้มตามเวลาไทย</p>
        </div>
        <Mascot pose="reward" size={64} />
      </section>

      {error ? <Banner kind="error" text={error} /> : null}

      {redeemedCode ? (
        <section className="flex flex-col items-center gap-3 rounded-md border border-line-strong bg-card p-5 text-center">
          <span className="rounded-pill bg-status-ok-bg px-3 py-1 text-xs font-bold text-status-ok">
            แลกของรางวัลสำเร็จ ✓
          </span>
          <h2 className="text-lg font-bold text-primary">{redeemedCode.rewardName}</h2>
          <p className="font-mono text-2xl font-bold text-primary">{redeemedCode.code}</p>
          <p className="text-xs text-secondary">
            หักแต้มและกันสต็อกเรียบร้อยแล้ว · แต้มคงเหลือ {points.balance} แต้ม
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-primary">ของรางวัลที่แลกได้</h2>
        {rewards.map((reward) => {
          const canRedeem = points.balance >= reward.cost && reward.stock > 0;
          return (
            <div
              key={reward.id}
              className="flex items-center justify-between gap-3 rounded-md border border-line bg-card p-4"
            >
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold text-primary">{reward.name}</h3>
                <p className="text-xs text-secondary">
                  ใช้ {reward.cost} แต้ม · เหลือ {reward.stock} ชิ้น
                </p>
              </div>
              <Button
                variant="primary"
                disabled={!canRedeem}
                busy={busyId === reward.id}
                onClick={() => handleRedeem(reward)}
              >
                {reward.stock <= 0 ? "ของหมด" : `แลก ${reward.cost} แต้ม`}
              </Button>
            </div>
          );
        })}
      </section>
    </main>
  );
}
