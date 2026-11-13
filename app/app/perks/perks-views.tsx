"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppHeader } from "@/components/shell/app-header";
import { useToast } from "@/components/shell/toast";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Mascot } from "@/components/ui/mascot";
import { ApiError } from "@/lib/client/errors";
import { loadClaimedCode, saveClaimedCode, type ClaimedCode } from "@/lib/client/claimed-code";
import type { Promo, Reward } from "@/lib/client/types";
import { useApi } from "@/lib/client/use-api";
import { useSubmit } from "@/lib/client/use-submit";
import { formatThaiDate, formatThaiTime } from "@/lib/format/date";
import { formatBaht } from "@/lib/format/money";

const noopSubscribe = () => () => {};
const MSG_NOT_READY = "ยังไม่พร้อมใช้งาน";
const MSG_LOAD_FAILED = "โหลดข้อมูลไม่สำเร็จ ตรวจสอบสัญญาณแล้วลองใหม่อีกครั้ง";

interface Points {
  balance: number;
  claimedToday: boolean;
}

// No points API yet (or it failed): show 0, never a guess.
const NO_POINTS: Points = { balance: 0, claimedToday: false };

function isCode(err: unknown, code: string): boolean {
  return err instanceof ApiError && err.code === code;
}

function errorText(err: unknown, fallback: string): string {
  if (isCode(err, "not_implemented")) return MSG_NOT_READY;
  return err instanceof ApiError ? err.message : fallback;
}

// Compares the promo with today's budget using ONLY what the server sent: leftAfter when it fits,
// overBy when it does not. Anything unknown (null) means no comparison line at all.
function budgetLine(promo: Promo): { fits: boolean; text: string } | null {
  if (promo.fitsBudget === true && promo.leftAfter !== null) {
    return { fits: true, text: `ซื้อได้ · เหลือ ${formatBaht(promo.leftAfter)} บาท` };
  }
  if (promo.fitsBudget === false && promo.overBy !== null) {
    return { fits: false, text: `เกินงบวันนี้ ${formatBaht(promo.overBy)} บาท` };
  }
  return null;
}

function SponsoredTag() {
  return (
    <span className="rounded-pill bg-subtle px-2.5 py-0.5 text-xs font-semibold text-link">
      ข้อเสนอจากผู้สนับสนุน
    </span>
  );
}

type Load<T> =
  | { state: "loading" }
  | { state: "not_ready" }
  | { state: "not_found" }
  | { state: "failed" }
  | { state: "ok"; value: T };

function loadFailure(err: unknown): Load<never> {
  if (isCode(err, "not_implemented")) return { state: "not_ready" };
  if (isCode(err, "not_found")) return { state: "not_found" };
  return { state: "failed" };
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Banner kind="error" text={MSG_LOAD_FAILED} />
      <Button variant="primary" onClick={onRetry}>
        ลองใหม่
      </Button>
    </div>
  );
}

export function PerksListView() {
  const api = useApi();
  const [promos, setPromos] = useState<Load<Promo[]>>({ state: "loading" });
  const [points, setPoints] = useState<Points>(NO_POINTS);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .points()
      .then((p) => {
        if (!cancelled) setPoints(p);
      })
      .catch(() => {
        if (!cancelled) setPoints(NO_POINTS);
      });
    api.promos().then(
      (list) => {
        if (!cancelled) setPromos({ state: "ok", value: list });
      },
      (err) => {
        if (!cancelled) setPromos(loadFailure(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="สิทธิพิเศษ & แต้ม" tone="default" />

      <section className="flex flex-col gap-2 rounded-md border border-line bg-reward-bg p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-secondary">แต้มของฉัน</span>
            <span className="text-2xl font-bold tabular-nums text-primary">{points.balance} แต้ม</span>
          </div>
          <Link href="/app/points" className={buttonClass("secondary")}>
            ดูของที่แลกได้ ›
          </Link>
        </div>
        <p className="text-xs text-secondary">
          กด &quot;รับแต้มฟรี&quot; ในหน้าสรุป ได้วันละ 1 แต้ม{points.claimedToday ? " · วันนี้รับแล้ว" : ""}
        </p>
      </section>

      {promos.state === "loading" ? (
        <p className="py-6 text-sm text-secondary" aria-busy="true">
          กำลังโหลดสิทธิพิเศษ…
        </p>
      ) : promos.state === "failed" ? (
        <LoadFailed
          onRetry={() => {
            setPromos({ state: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      ) : promos.state === "ok" && promos.value.length > 0 ? (
        <div className="flex flex-col gap-3">
          {promos.value.map((promo) => {
            const line = budgetLine(promo);
            return (
              <article key={promo.id} className="flex flex-col gap-3 rounded-md border border-line bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <SponsoredTag />
                  <span className="text-xs text-secondary">{promo.validDays}</span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-secondary">{promo.shop}</p>
                    <h2 className="text-base font-semibold text-primary">{promo.title}</h2>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold tabular-nums text-primary">{formatBaht(promo.price)}</span>
                    <span className="ml-1 text-xs text-secondary">บาท</span>
                  </div>
                </div>

                {line ? (
                  <div
                    className={`rounded-sm px-3 py-2 text-xs font-medium ${
                      line.fits ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
                    }`}
                  >
                    {line.text}
                  </div>
                ) : null}

                <Link href={`/app/perks/${promo.id}`} className={buttonClass("secondary", true)}>
                  ดูรายละเอียดและรับสิทธิ์
                </Link>
              </article>
            );
          })}
        </div>
      ) : promos.state === "ok" ? (
        <EmptyState title="ยังไม่มีข้อเสนอตอนนี้" body="เมื่อมีข้อเสนอจากผู้สนับสนุน จะแสดงที่นี่" />
      ) : (
        <EmptyState title={MSG_NOT_READY} body="ข้อเสนอจากผู้สนับสนุนจะแสดงที่นี่เมื่อระบบพร้อม" />
      )}
    </main>
  );
}

export function PerkDetailView() {
  const api = useApi();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const promoId = params?.id ?? "";
  const claim = useSubmit<ClaimedCode>();
  const [loaded, setPromo] = useState<Load<Promo>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const promo: Load<Promo> = promoId ? loaded : { state: "not_found" }; // no id: never guess another promo

  useEffect(() => {
    let cancelled = false;
    if (!promoId) return;
    api.promo(promoId).then(
      (p) => {
        if (!cancelled) setPromo({ state: "ok", value: p });
      },
      (err) => {
        if (!cancelled) setPromo(loadFailure(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, promoId, attempt]);

  // The code is requested only when the user taps, never when the page opens.
  async function handleClaim() {
    const result = await claim.submit(promoId, () => api.claimPromo(promoId));
    if (!result.ok) return;
    saveClaimedCode(promoId, result.value);
    router.push(`/app/perks/${promoId}/code`);
  }

  const header = <AppHeader title="รายละเอียดโปร" back="/app/perks" tone="default" />;

  if (promo.state === "loading") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body" aria-busy="true">
        {header}
        <p className="text-sm text-secondary">กำลังโหลดรายละเอียด…</p>
      </main>
    );
  }
  if (promo.state === "failed") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        {header}
        <LoadFailed
          onRetry={() => {
            setPromo({ state: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      </main>
    );
  }
  if (promo.state === "not_found") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        {header}
        <Banner kind="error" text="ไม่พบโปรโมชันนี้" />
      </main>
    );
  }
  if (promo.state === "not_ready") {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        {header}
        <EmptyState title={MSG_NOT_READY} body="รายละเอียดโปรจะแสดงที่นี่เมื่อระบบพร้อม" />
      </main>
    );
  }

  const p = promo.value;
  const line = budgetLine(p);
  const claimError = claim.error ? errorText(claim.error, "รับรหัสไม่สำเร็จ ลองใหม่อีกครั้ง") : null;

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      {header}

      <section className="flex flex-col gap-3 rounded-md border border-line bg-card p-5">
        <span className="self-start">
          <SponsoredTag />
        </span>
        <div>
          <p className="text-sm text-secondary">{p.shop}</p>
          <h2 className="text-xl font-bold text-primary">{p.title}</h2>
        </div>

        <div className="flex items-baseline gap-1.5 border-y border-line py-3">
          <span className="text-3xl font-bold tabular-nums text-primary">{formatBaht(p.price)}</span>
          <span className="text-sm font-semibold text-secondary">บาท · ใช้ได้ {p.validDays}</span>
        </div>

        {line ? (
          <div className={`rounded-sm p-3 text-sm ${line.fits ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}>
            <p className="font-semibold">เทียบกับแผนของคุณ</p>
            <p>
              {line.fits ? "ผล " : ""}
              {line.text}
            </p>
            <p className="pt-1 text-xs text-secondary">คำนวณจากแผนของคุณ ไม่ได้ส่งข้อมูลของคุณให้ร้าน</p>
          </div>
        ) : null}

        {p.terms.length > 0 ? (
          <div className="flex flex-col gap-1.5 pt-1 text-sm">
            <h3 className="font-semibold text-primary">เงื่อนไข</h3>
            <ul className="list-inside list-disc text-xs text-secondary">
              {p.terms.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {claimError ? <Banner kind={isCode(claim.error, "not_implemented") ? "info" : "error"} text={claimError} /> : null}

      <div className="flex flex-col gap-2">
        <Button variant="primary" block busy={claim.busy} onClick={handleClaim}>
          รับรหัส
        </Button>
        <Link
          href={`/app/try/result?promo=${encodeURIComponent(p.id)}`}
          className={buttonClass("secondary", true)}
        >
          ลองก่อนจ่ายด้วยราคานี้
        </Link>
      </div>
    </main>
  );
}

// expiresAt is a calendar date (YYYY-MM-DD) or an ISO instant; anything else is shown as received.
function expiryText(expiresAt: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    try {
      return `หมดเขต ${formatThaiDate(expiresAt, "long")}`;
    } catch {
      return `หมดเขต ${expiresAt}`;
    }
  }
  if (!Number.isNaN(Date.parse(expiresAt))) return `หมดอายุ ${formatThaiTime(expiresAt)} น.`;
  return `หมดอายุ ${expiresAt}`;
}

// undefined = not read yet (sessionStorage is only read after mount); null = no claim stored.
function useStoredClaim(promoId: string): ClaimedCode | null | undefined {
  const raw = useSyncExternalStore<string | undefined>(
    noopSubscribe,
    () => JSON.stringify(promoId ? loadClaimedCode(promoId) : null),
    () => undefined,
  );
  return useMemo(() => (raw === undefined ? undefined : (JSON.parse(raw) as ClaimedCode | null)), [raw]);
}

export function PerkCodeView() {
  const api = useApi();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const promoId = params?.id ?? "";
  const claim = useStoredClaim(promoId);
  const [promo, setPromo] = useState<Promo | null>(null);

  useEffect(() => {
    if (claim === null) router.replace(`/app/perks/${promoId}`);
  }, [claim, promoId, router]);

  useEffect(() => {
    if (!claim) return;
    let cancelled = false;
    api.promo(promoId).then(
      (p) => {
        if (!cancelled) setPromo(p);
      },
      () => {
        // the code is still valid without the shop name
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, promoId, claim]);

  if (!claim) {
    return (
      <main className="py-8 font-body text-sm text-secondary" aria-busy="true">
        กำลังโหลด…
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="รหัสโปร" back={`/app/perks/${promoId}`} tone="default" />

      <section className="flex flex-col items-center gap-4 rounded-md border border-line-strong bg-card p-6 text-center">
        <SponsoredTag />
        {promo ? (
          <div>
            <p className="text-xs text-secondary">{promo.shop}</p>
            <h2 className="text-lg font-bold text-primary">{promo.title}</h2>
          </div>
        ) : null}

        <p data-clarity-mask="true" className="font-mono text-4xl font-bold tracking-wider text-primary">
          {claim.code}
        </p>
        <p className="text-sm text-secondary">แสดงให้พนักงานตอนจ่าย ร้านจะสแกนหรือพิมพ์รหัสนี้</p>
      </section>

      <Banner kind="warn" text={`รอร้านยืนยัน · ${expiryText(claim.expiresAt)}`} />
    </main>
  );
}

// P3b "ใช้โปรสำเร็จ". Nothing links here yet: it needs a redemption-status API (the shop's confirmation
// time) that does not exist, so even with a stored claim it only says "not ready".
export function PerkUsedView() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const promoId = params?.id ?? "";
  const claim = useStoredClaim(promoId);

  useEffect(() => {
    if (claim === null) router.replace(`/app/perks/${promoId}`);
  }, [claim, promoId, router]);

  if (!claim) {
    return (
      <main className="py-8 font-body text-sm text-secondary" aria-busy="true">
        กำลังโหลด…
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="รหัสโปร" back={`/app/perks/${promoId}/code`} tone="default" />
      <EmptyState
        title={MSG_NOT_READY}
        body="สถานะการยืนยันจากร้านจะแสดงที่นี่เมื่อระบบพร้อม"
        action={{ label: "กลับไปที่รหัส", href: `/app/perks/${promoId}/code`, variant: "secondary" }}
      />
    </main>
  );
}

type RedeemedInfo = { rewardName: string; cost: number; code: string; balance: number };

export function PointsView() {
  const api = useApi();
  const toast = useToast();
  const claim = useSubmit<{ balance: number; claimedToday: true }>();
  const redeem = useSubmit<{ balance: number; code: string }>();
  const [points, setPoints] = useState<Points>(NO_POINTS);
  const [rewards, setRewards] = useState<Load<Reward[]>>({ state: "loading" });
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<RedeemedInfo | null>(null);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const loadAll = useCallback(() => {
    let cancelled = false;
    api
      .points()
      .then((p) => {
        if (!cancelled) setPoints(p);
      })
      .catch(() => {
        if (!cancelled) setPoints(NO_POINTS);
      });
    api.rewards().then(
      (list) => {
        if (!cancelled) setRewards({ state: "ok", value: list });
      },
      (err) => {
        if (!cancelled) setRewards(loadFailure(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => loadAll(), [loadAll, attempt]);

  async function handleClaim() {
    setMessage(null);
    const result = await claim.submit("claim-daily-points", (key) => api.claimPoints(key));
    if (result.ok) {
      setPoints(result.value);
      toast.show(`รับแต้มฟรีแล้ว +1 · รวม ${result.value.balance} แต้ม`, { mascot: "reward" });
      return;
    }
    if ("skipped" in result) return;
    // Points stay exactly as they were: nothing was granted.
    setMessage({
      kind: isCode(result.error, "not_implemented") ? "info" : "error",
      text: errorText(result.error, "รับแต้มไม่สำเร็จ ลองใหม่อีกครั้ง"),
    });
  }

  async function handleRedeem(reward: Reward) {
    setMessage(null);
    setRedeemingId(reward.id);
    const result = await redeem.submit(reward.id, (key) => api.redeemReward(reward.id, key));
    if (result.ok) {
      setPoints((prev) => ({ ...prev, balance: result.value.balance }));
      setRedeemed({
        rewardName: reward.name,
        cost: reward.cost,
        code: result.value.code,
        balance: result.value.balance,
      });
      return;
    }
    if ("skipped" in result) return;
    setRedeemingId(null);
    setMessage({
      kind: isCode(result.error, "not_implemented") ? "info" : "error",
      text: errorText(result.error, "แลกของรางวัลไม่สำเร็จ ลองใหม่อีกครั้ง"),
    });
  }

  function backToPoints() {
    redeem.reset();
    setRedeemed(null);
    setRedeemingId(null);
    setRewards({ state: "loading" });
    setAttempt((n) => n + 1);
  }

  if (redeemed) {
    return (
      <main className="flex flex-col gap-4 py-2 font-body">
        <AppHeader title="แลกของ" tone="default" />
        <section className="flex flex-col items-center gap-3 rounded-md border border-line-strong bg-card p-6 text-center">
          <Mascot pose="reward" size={88} />
          <h2 className="text-lg font-bold text-primary">แลกสำเร็จ</h2>
          <dl className="flex w-full flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-secondary">ของที่แลก</dt>
              <dd className="font-semibold text-primary">{redeemed.rewardName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary">หักแต้ม</dt>
              <dd className="font-semibold tabular-nums text-primary">{redeemed.cost} แต้ม</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary">เหลือ</dt>
              <dd className="font-semibold tabular-nums text-primary">{redeemed.balance} แต้ม</dd>
            </div>
          </dl>
          <p className="text-xs text-secondary">รหัสรับของ</p>
          <p data-clarity-mask="true" className="font-mono text-3xl font-bold text-primary">
            {redeemed.code}
          </p>
        </section>
        <Button variant="primary" block onClick={backToPoints}>
          กลับหน้าแต้ม
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4 py-2 font-body">
      <AppHeader title="แต้มของฉัน" back="/app/perks" tone="default" />

      <section className="flex items-center justify-between gap-3 rounded-md border border-line bg-reward-bg p-5">
        <div>
          <span className="text-xs font-semibold text-secondary">แต้มสะสม</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold tabular-nums text-primary">{points.balance}</span>
            <span className="text-sm font-semibold text-primary">แต้ม</span>
          </div>
          <p className="mt-1 text-xs text-secondary">กด &quot;รับแต้มฟรี&quot; ได้วันละ 1 แต้ม</p>
        </div>
        <Mascot pose="reward" size={72} />
      </section>

      {points.claimedToday ? (
        <p className="rounded-pill border border-line-strong bg-card px-4 py-2 text-center text-sm font-semibold text-ok">
          รับแต้มฟรีแล้ววันนี้ ✓
        </p>
      ) : (
        <Button variant="primary" block busy={claim.busy} onClick={handleClaim}>
          รับแต้มฟรี
        </Button>
      )}

      {message ? <Banner kind={message.kind} text={message.text} /> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-primary">แลกของ</h2>
        {rewards.state === "loading" ? (
          <p className="text-sm text-secondary" aria-busy="true">
            กำลังโหลดของรางวัล…
          </p>
        ) : rewards.state === "failed" ? (
          <LoadFailed
            onRetry={() => {
              setRewards({ state: "loading" });
              setAttempt((n) => n + 1);
            }}
          />
        ) : rewards.state === "ok" && rewards.value.length > 0 ? (
          rewards.value.map((reward) => (
            <div
              key={reward.id}
              className="flex items-center justify-between gap-3 rounded-md border border-line bg-card p-4"
            >
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold text-primary">{reward.name}</h3>
                <p className="text-xs text-secondary">
                  {reward.stock > 0 ? `เหลือ ${reward.stock} ชิ้น` : "หมดแล้ว"}
                </p>
              </div>
              <Button
                variant="primary"
                disabled={reward.stock <= 0 || (redeem.busy && redeemingId !== reward.id)}
                busy={redeem.busy && redeemingId === reward.id}
                onClick={() => handleRedeem(reward)}
              >
                {reward.stock <= 0 ? "ของหมด" : `${reward.cost} แต้ม`}
              </Button>
            </div>
          ))
        ) : rewards.state === "ok" ? (
          <EmptyState title="ยังไม่มีของรางวัลให้แลก" />
        ) : (
          <Banner kind="info" text={`${MSG_NOT_READY} — ของรางวัลจะแสดงที่นี่เมื่อระบบพร้อม`} />
        )}
      </section>
    </main>
  );
}
