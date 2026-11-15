"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./miniapp.module.css";

const features = [
  {
    title: "พิมพ์แล้วจดเลย",
    sub: "เรื่องเล็ก ๆ ก็ไม่หล่นหาย",
    body: "พิมพ์ชื่อกับยอดทีละรายการ พอใช้ช่วยจัดหมวดให้ หรือเปิดแอปจดเองได้เสมอ",
    pose: "greeting",
    path: "/app/record/new",
    action: "จดรายจ่าย",
    kind: "record",
  },
  {
    title: "เห็นเงินที่พอใช้",
    sub: "วันนี้ จนถึงวันเงินเข้า",
    body: "ดูงบรายวัน บิล และเงินที่กันไว้ จากข้อมูลจริงที่คุณบันทึก",
    pose: "budgetOk",
    path: "/app",
    action: "ดูแผนของฉัน",
    kind: "budget",
  },
  {
    title: "อยากได้ ลองคิดก่อน",
    sub: "เลือกให้พอดีกับแผน",
    body: "ลองราคาที่อยากจ่าย ดูผลต่อแผน ก่อนเลือกเก็บไว้หรือจ่ายจริง",
    pose: "thinking",
    path: "/app/try",
    action: "ลองก่อนจ่าย",
    kind: "try",
  },
  {
    title: "เริ่มทีละนิดก็ได้",
    sub: "ให้ทุกวันเป็นวันที่พอใช้",
    body: "ตั้งเงินที่มี วันรับเงิน บิล และเป้าออม แล้วค่อย ๆ สร้างแผนในแบบของคุณ",
    pose: "saveCoins",
    path: "/app/setup/income",
    action: "ตั้งแผนเงิน",
    kind: "setup",
  },
] as const;

function MascotArt({
  pose,
  className = "",
}: {
  pose: string;
  className?: string;
}) {
  return (
    <picture className={className}>
      <source
        srcSet={`/mascot/${pose}.webp`}
        media="(prefers-reduced-motion: no-preference)"
      />
      <img
        src={`/mascot/${pose}.png`}
        alt=""
        width="240"
        height="240"
        loading="lazy"
      />
    </picture>
  );
}

function FeaturePreview({ kind }: { kind: string }) {
  return (
    <div className={styles.preview}>
      <span className={styles.sample}>ตัวอย่างการแสดงผล</span>
      {kind === "record" ? (
        <>
          <div className={styles.chat}>ข้าวเที่ยง 50</div>
          <div className={styles.receipt}>
            <strong>จดเรียบร้อย ✓</strong>
            <span>รายจ่าย · อาหาร</span>
            <div>
              <b>ข้าวเที่ยง</b>
              <b>−฿50</b>
            </div>
            <hr />
            <small>แก้ไขรายการได้ในแอป ↗</small>
          </div>
        </>
      ) : kind === "budget" ? (
        <>
          <div className={styles.budgetPreview}>
            <span>ตัวอย่าง · เหลือใช้วันนี้</span>
            <strong>
              120<small> บาท</small>
            </strong>
            <small>เห็นงบของคุณหลังตั้งรอบเงิน</small>
          </div>
          <div className={styles.chips}>
            <span>บิล</span>
            <span>เงินออม</span>
            <span>เงินเผื่อ</span>
          </div>
        </>
      ) : kind === "try" ? (
        <>
          <div className={styles.chat}>ชาบู 199 ไหวไหม?</div>
          <div className={styles.receipt}>
            <strong>ลองคิดก่อนจ่าย</strong>
            <span>ดูผลต่อแผนเงินของคุณ</span>
            <div className={styles.choice}>
              <span>เก็บไว้ในแผน</span>
              <span>จ่ายจริงแล้ว</span>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.steps}>
          <div>
            <span>01</span>
            <b>เงินที่มีตอนนี้</b>
            <i>฿</i>
          </div>
          <div>
            <span>02</span>
            <b>วันเงินเข้า</b>
            <i>▦</i>
          </div>
          <div>
            <span>03</span>
            <b>บิลและเงินออม</b>
            <i>✓</i>
          </div>
          <p>เริ่มจากข้อมูลของคุณ</p>
        </div>
      )}
    </div>
  );
}

type Props = {
  status: "loading" | "login" | "ready" | "error";
  name: string | null;
  error: string | null;
  busy: boolean;
  onLogin: (path: string) => void;
};

export function MiniAppWelcome({ status, name, error, busy, onLogin }: Props) {
  const [cardIndex, setCardIndex] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    function update() {
      if (!el) return;
      const first = el.children[0] as HTMLElement;
      setEdges({
        start: el.scrollLeft <= 2,
        end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2,
      });
      setCardIndex(
        Math.min(
          3,
          Math.max(0, Math.round(el.scrollLeft / (first.offsetWidth + 16))),
        ),
      );
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);
  const oaId = process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID;
  const ready = status === "ready";

  function action(label: string, path: string, secondary = false) {
    const cls = secondary ? styles.secondary : styles.primary;
    return ready ? (
      <Link href={path} className={cls}>
        {label}
        <span aria-hidden="true">↗</span>
      </Link>
    ) : (
      <button
        className={cls}
        onClick={() => onLogin(path)}
        disabled={busy || status === "loading" || status === "error"}
      >
        {busy ? "กำลังเปิด LINE…" : label}
        <span aria-hidden="true">↗</span>
      </button>
    );
  }

  function moveCard(index: number) {
    const child = rail.current?.children[index] as HTMLElement | undefined;
    if (!child || !rail.current) return;
    rail.current.scrollTo({
      left:
        child.offsetLeft - (rail.current.children[0] as HTMLElement).offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  function move(direction: number) {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({
      left: direction * ((el.children[0] as HTMLElement).offsetWidth + 16),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          พอใช้<span>PORCHAI</span>
        </Link>
        <span className={styles.channel}>
          <i />
          เพื่อนเรื่องเงิน บน LINE
        </span>
      </header>
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="miniapp-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>จดง่าย · คิดก่อนจ่าย · ใช้ได้พอดี</p>
            <h1 id="miniapp-title">
              เรื่องเงินทุกวัน
              <br />
              มีเพื่อนช่วยคิด
            </h1>
            <p className={styles.lead}>
              ข้าวมื้อนี้ ค่ารถพรุ่งนี้ หรือของที่อยากได้
              <br />
              ค่อย ๆ วางแผนไปด้วยกันนะ
            </p>
            {status === "loading" ? (
              <p role="status" className={styles.connection} aria-busy="true">
                กำลังเชื่อมต่อ LINE…
              </p>
            ) : ready ? (
              <p role="status" className={styles.connection}>
                ✓ เชื่อมต่อ LINE แล้ว · สวัสดี{name ? ` ${name}` : "ครับ"}
              </p>
            ) : (
              <p className={styles.connection}>เริ่มด้วยบัญชี LINE ของคุณ</p>
            )}
            <div className={styles.heroActions}>
              {action(ready ? "เปิดแผนของฉัน" : "เริ่มใช้งานด้วย LINE", "/app")}
              {oaId && (
                <a
                  href={`https://line.me/R/ti/p/${encodeURIComponent(oaId)}`}
                  className={styles.friend}
                >
                  เพิ่มเพื่อนพอใช้ OA ↗
                </a>
              )}
            </div>
          </div>
          <div className={styles.heroArt}>
            <span className={styles.artNote}>ทีละนิด ก็พอใช้</span>
            <MascotArt pose="greeting" />
            <span className={styles.hello}>สวัสดี :)</span>
          </div>
        </section>

        {error && (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>
              ลองเชื่อมต่ออีกครั้ง ↻
            </button>
          </div>
        )}

        <section className={styles.guide} aria-labelledby="guide-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>รู้จักเพื่อนคนนี้อีกนิด</p>
              <h2 id="guide-title">พอใช้ ช่วยอะไรได้บ้าง</h2>
            </div>
            <span>เลื่อนดูได้เลย →</span>
          </div>
          <div className={styles.rail} ref={rail}>
            {features.map((f, i) => (
              <article
                key={f.kind}
                className={`${styles.feature} ${styles[f.kind]}`}
                aria-label={`${i + 1}. ${f.title}`}
              >
                <div className={styles.featureHeading}>
                  <span className={styles.cardNumber}>0{i + 1}</span>
                  <h3>{f.title}</h3>
                  <p>{f.sub}</p>
                </div>
                <div className={styles.stage}>
                  <FeaturePreview kind={f.kind} />
                  <MascotArt pose={f.pose} className={styles.cardMascot} />
                </div>
                <p className={styles.featureBody}>{f.body}</p>
                {action(f.action, f.path, true)}
              </article>
            ))}
          </div>
          <div className={styles.railControls}>
            <button
              aria-label="การ์ดก่อนหน้า"
              disabled={edges.start}
              onClick={() => move(-1)}
            >
              ←
            </button>
            <div className={styles.dots}>
              {features.map((f, i) => (
                <button
                  key={f.kind}
                  aria-label={`ดูการ์ด ${i + 1}: ${f.title}`}
                  aria-pressed={cardIndex === i}
                  onClick={() => moveCard(i)}
                />
              ))}
            </div>
            <button
              aria-label="การ์ดถัดไป"
              disabled={edges.end}
              onClick={() => move(1)}
            >
              →
            </button>
          </div>
        </section>

        <section className={styles.chatSection} aria-labelledby="chat-title">
          <div>
            <p className={styles.eyebrow}>อยู่ในแชตที่คุ้นเคย</p>
            <h2 id="chat-title">พิมพ์หาเราได้เลย</h2>
            <p>
              จดรายจ่ายทีละรายการ เช่น “ข้าว 50”
              <br />
              หรือถามก่อนจ่าย “ชาบู 199 ไหวไหม”
            </p>
            <p className={styles.note}>
              ยอดจริงจะแสดงหลังตั้งรอบเงินและบันทึกรายการแล้ว
            </p>
          </div>
          <div className={styles.chatExample}>
            <span className={styles.sample}>ตัวอย่างบทสนทนา</span>
            <div className={styles.chat}>ข้าวเที่ยง 50</div>
            <div className={styles.chatReceipt}>
              <MascotArt pose="budgetOk" />
              <strong>จดเรียบร้อย ✓</strong>
              <span>ข้าวเที่ยง · อาหาร</span>
              <b>−฿50</b>
              <small>แก้ไขหรือดูแผนต่อใน LIFF ได้</small>
            </div>
          </div>
        </section>

        <details className={styles.motionGallery}>
          <summary>
            พบกับพอใช้ ในทุกวันของคุณ <span aria-hidden="true">＋</span>
          </summary>
          <div className={styles.originalMascot}>
            <picture>
              <source
                srcSet="/brand/porchai.webp"
                media="(prefers-reduced-motion: no-preference)"
              />
              <img
                src="/mascot/greeting.png"
                width="160"
                height="160"
                alt="มาสคอตพอใช้ กระเป๋าเงินสีเขียว"
                loading="lazy"
              />
            </picture>
            <p>เพื่อนตัวเล็ก ที่อยู่ข้างแผนของคุณ</p>
          </div>
          <div className={styles.galleryGrid}>
            {[
              ...features,
              { pose: "scanReceipt", sub: "ช่วยอ่านรายการ" },
              { pose: "budgetTight", sub: "คิดเผื่อวันพรุ่งนี้" },
              { pose: "reminder", sub: "เพื่อนเตือนความจำ" },
              { pose: "reward", sub: "ทุกก้าวเล็ก ๆ มีความหมาย" },
            ].map((f) => (
              <div key={f.pose}>
                <MascotArt pose={f.pose} />
                <span>{f.sub}</span>
              </div>
            ))}
          </div>
          <div className={styles.videos}>
            <video
              controls
              playsInline
              preload="none"
              poster="/mascot/greeting.png"
              aria-label="วิดีโอมาสคอตพอใช้"
            >
              <source src="/brand/porchai.mp4" type="video/mp4" />
            </video>
            <video
              controls
              playsInline
              preload="none"
              poster="/mascot/thinking.png"
              aria-label="วิดีโอมาสคอตพอใช้ 8 กิจกรรม"
            >
              <source src="/brand/activities.mp4" type="video/mp4" />
            </video>
          </div>
        </details>
        <footer className={styles.footer}>
          <span>พอใช้ · เพื่อนช่วยคิด เรื่องใช้เงิน</span>
          <Link href="/app/settings/privacy">ความเป็นส่วนตัว ↗</Link>
        </footer>
      </main>
      <div className={styles.bottomBar}>
        <span>
          เริ่มทีละนิด
          <br />
          <b>ใช้ได้พอดี</b>
        </span>
        {action(ready ? "เปิดพอใช้" : "เริ่มใช้งาน", "/app")}
      </div>
    </div>
  );
}
