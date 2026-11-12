"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ChatPreview from "./chat-preview";
import LineShowcase, { lineFeatures } from "./line-showcase";
import s from "./marketing.module.css";

const faqs = [
  [
    "พอใช้เหมาะกับใคร?",
    "นักศึกษาที่รับเงินเป็นรอบ มีค่าอาหารและค่าเดินทางประจำ อยากเริ่มเห็นว่าใช้ไปกับอะไร และเงินจะพอถึงรอบหน้าหรือเปล่า",
  ],
  [
    "ตอนนี้ใช้งานอะไรได้แล้ว?",
    "รุ่น Developing มีการเชื่อม LIFF ตรวจ ID token ฝั่งเซิร์ฟเวอร์ และหน้าโปรตัวอย่าง ส่วนจดรายจ่าย OCR การเตือน AI คูปองและแต้มจริงยังอยู่ระหว่างพัฒนา",
  ],
  [
    "LINE OA กับ MINI App ต่างกันอย่างไร?",
    "OA เป็นช่องทางแชตและรับการเตือนที่เลือกเปิด ส่วน MINI App เป็นหน้าจอสำหรับดูและจัดการแผน รายการ โปร และแต้ม ไม่ต้องติดตั้งแอปพอใช้เพิ่ม",
  ],
  [
    "ทดสอบผ่าน LINE ได้อย่างไร?",
    "ทีมต้องตั้ง HTTPS Endpoint ใน Developing ให้ชี้ /miniapp และใช้บัญชีที่มีสิทธิ์ทดสอบ จากนั้นเปิด Developing MINI App URL หรือ QR ที่ Console ให้",
  ],
  [
    "นักศึกษาต้องจ่ายค่าบริการไหม?",
    "แผนธุรกิจให้เครื่องมือหลักสำหรับนักศึกษาใช้ฟรี รายได้มาจากร้านค้าและผู้สนับสนุนที่จัดแคมเปญ เงื่อนไขจริงจะระบุก่อนเปิดใช้",
  ],
  [
    "ตัวเลขและบทสนทนาเป็นข้อมูลจริงไหม?",
    "ทั้งหมดเป็นข้อมูลสมมติสำหรับอธิบายแนวคิด การกดดูตัวอย่างไม่มีการบันทึกรายจ่าย หักเงิน ออกคูปอง หรือเพิ่มแต้ม",
  ],
  [
    "AI ตัดสินใจแทนหรือเปลี่ยนยอดเงินให้ไหม?",
    "แนวทางของพอใช้คือให้โค้ดคำนวณเงินจากแผน และให้ AI ช่วยอธิบายทางเลือก ผู้ใช้ตรวจและยืนยันเองก่อนบันทึกจริง ฟีเจอร์นี้ยังอยู่ระหว่างพัฒนา",
  ],
  [
    "ร้านค้าจะเห็นรายจ่ายส่วนตัวไหม?",
    "แนวทางรายงานร้านค้าใช้ข้อมูลรวมของแคมเปญ เช่น จำนวนรับและใช้สิทธิ์ ไม่แสดงแชต ชื่อ หรือประวัติรายจ่ายส่วนตัว หน้าเดโมธุรกิจปัจจุบันใช้ข้อมูลสมมติทั้งหมด",
  ],
] as const;
const scenarios = [
  {
    time: "12:00",
    title: "มื้อเที่ยงที่ไม่อยากลืมจด",
    quote: "ข้าว 50 บาท ส่งข้อความสั้น ๆ แล้วตรวจรายการก่อนยืนยัน",
    tag: "จดให้ต่อเนื่อง",
  },
  {
    time: "12:30",
    title: "วันที่รีบจนลืมเรื่องเงิน",
    quote:
      "ถ้ายังไม่เห็นรายการประจำ ให้พอใช้ช่วยถาม แล้วเลือกจด แก้ยอด หรือข้าม",
    tag: "ทบทวนแบบเลือกเอง",
  },
  {
    time: "18:00",
    title: "นัดกับเพื่อน ก็อยากไป",
    quote:
      "ลองเทียบ 199 บาทกับงบซื้อเพิ่ม 150 บาท เห็นส่วนต่าง 49 บาทก่อนเลือก",
    tag: "คิดก่อนจ่าย",
  },
  {
    time: "21:00",
    title: "ปิดวันด้วยความเข้าใจ",
    quote: "ใช้เวลาสั้น ๆ ทบทวนรายการ เห็นวันนี้ แล้วค่อยเตรียมพรุ่งนี้",
    tag: "เช็กแผนรายวัน",
  },
];

function Brand() {
  return (
    <>
      <span className={s.brandMark}>พ</span>
      <span>
        พอใช้<small>PORCHAI</small>
      </span>
    </>
  );
}
function Entry({
  children = "เปิด MINI App",
  secondary = false,
}: {
  children?: React.ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={secondary ? s.secondary : s.primary} href="/miniapp">
      {children}
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

export default function Marketing() {
  const [menu, setMenu] = useState(false);
  const [audience, setAudience] = useState<"students" | "partners">("students");
  const [slide, setSlide] = useState(0);
  const [story, setStory] = useState(0);
  const [top, setTop] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const oaId = process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const setup = () => {
      observer?.disconnect();
      const elements =
        root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
      elements?.forEach((el) => el.removeAttribute("data-revealing"));
      if (media.matches || !("IntersectionObserver" in window)) return;
      observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.removeAttribute("data-revealing");
              observer?.unobserve(entry.target);
            }
          }),
        { threshold: 0.12 },
      );
      elements?.forEach((el) => {
        if (el.getBoundingClientRect().top > innerHeight) {
          el.setAttribute("data-revealing", "true");
          observer?.observe(el);
        }
      });
    };
    const onScroll = () => setTop(window.scrollY > 700);
    setup();
    media.addEventListener("change", setup);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      observer?.disconnect();
      media.removeEventListener("change", setup);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  function moveSlide(next: number) {
    const clamped = Math.max(0, Math.min(5, next));
    setSlide(clamped);
    const card = rail.current?.children[clamped] as HTMLElement | undefined;
    if (card && rail.current)
      rail.current.scrollTo({
        left: card.offsetLeft - rail.current.offsetLeft,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }
  function moveRail(direction: number) {
    const element = rail.current;
    if (!element) return;
    const first = element.children[0] as HTMLElement | undefined;
    const second = element.children[1] as HTMLElement | undefined;
    if (!first || !second) return;
    element.scrollBy({
      left: direction * (second.offsetLeft - first.offsetLeft),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  const nav = (
    <>
      <a href="#how" onClick={() => setMenu(false)}>
        ใช้งานอย่างไร
      </a>
      <a href="#features" onClick={() => setMenu(false)}>
        ฟีเจอร์
      </a>
      <a href="#for-you" onClick={() => setMenu(false)}>
        พอใช้สำหรับใคร
      </a>
      <a href="#questions" onClick={() => setMenu(false)}>
        คำถามที่พบบ่อย
      </a>
    </>
  );
  return (
    <div ref={root} className={s.page}>
      <a className={s.skip} href="#main">
        ข้ามไปเนื้อหา
      </a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link className={s.brand} href="/" aria-label="พอใช้ หน้าแรก">
            <Brand />
          </Link>
          <nav className={s.desktopNav} aria-label="เมนูหลัก">
            {nav}
          </nav>
          <div className={s.headerActions}>
            <Entry />
            <button
              className={s.menuButton}
              aria-label={menu ? "ปิดเมนู" : "เปิดเมนู"}
              aria-expanded={menu}
              aria-controls="mobile-menu"
              onClick={() => setMenu(!menu)}
            >
              {menu ? "×" : "☰"}
            </button>
          </div>
        </div>
        {menu && (
          <nav id="mobile-menu" className={s.mobileNav} aria-label="เมนูมือถือ">
            {nav}
          </nav>
        )}
      </header>
      <main id="main">
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroAccent} aria-hidden="true">
            <span>฿</span>
            <span>✓</span>
            <span>＋</span>
          </div>
          <div className={s.heroInner}>
            <div className={s.heroCopy}>
              <p className={s.eyebrow}>
                <span className={s.statusDot} /> เพื่อนช่วยคิด
                เรื่องใช้เงินของนักศึกษา
              </p>
              <h1 id="hero-title">
                จดให้ง่าย
                <br />
                คิดก่อนจ่าย
                <br />
                <em>ให้เงินพอใช้.</em>
              </h1>
              <p className={s.heroIntro}>
                มื้อเที่ยง ค่าเดินทาง หรือนัดกับเพื่อน
                <br />
                เริ่มดูแลเงินทีละนิด ผ่าน LINE ที่คุ้นเคย
              </p>
              <div className={s.heroActions}>
                <Entry>เริ่มต้นผ่าน LINE</Entry>
                <a className={s.textLink} href="#how">
                  เลื่อนดูวิธีใช้ <span aria-hidden="true">↓</span>
                </a>
              </div>
              <p className={s.statusNote}>รุ่น Developing · เปิดทดสอบกับทีม</p>
              <div className={s.heroFacts}>
                <div>
                  <strong>จด</strong>
                  <span>ให้เห็นว่าใช้ไปกับอะไร</span>
                </div>
                <div>
                  <strong>ทบทวน</strong>
                  <span>ให้ไม่หลุดจากแผน</span>
                </div>
                <div>
                  <strong>เลือกเอง</strong>
                  <span>ให้ถึงสิ่งที่ตั้งใจ</span>
                </div>
              </div>
            </div>
            <div className={s.heroVisual}>
              <ChatPreview />
              <span className={s.floatingNote}>
                เรื่องเล็ก ๆ วันนี้
                <br />
                <strong>พอใช้วันข้างหน้า</strong>
              </span>
            </div>
          </div>
        </section>
        <LineShowcase />
        <section className={s.conversationCta} data-reveal>
          <div className={s.conversation}>
            <span className={s.roundAvatar}>พ</span>
            <p>เรื่องเงิน เริ่มจากคุยกันก็ได้</p>
          </div>
          <p className={s.replyBubble}>
            แล้วเริ่มตรงไหนดี? <span aria-hidden="true">↙</span>
          </p>
          <h2>
            ลองรู้จักพอใช้
            <br />
            <em>ผ่าน LINE MINI App</em>
          </h2>
          <Entry>เปิดหน้าทดสอบ</Entry>
          <p className={s.fine}>ยังไม่บันทึกข้อมูลการเงินจริง</p>
        </section>
        <section
          id="features"
          className={s.featureSection}
          aria-labelledby="features-title"
        >
          <div className={s.sectionHeading} data-reveal>
            <p className={s.eyebrow}>เล็กลงในทุกขั้นตอน</p>
            <h2 id="features-title">
              มีพื้นที่ให้เรื่องเงิน
              <br />
              <em>ในชีวิตประจำวัน</em>
            </h2>
            <p>
              แนวทางที่ทีมกำลังพัฒนา เพื่อให้จดง่ายขึ้น
              <br />
              เห็นแผนชัดขึ้น และตัดสินใจได้ด้วยตัวเอง
            </p>
          </div>
          <div className={s.featureGrid}>
            <article data-reveal>
              <span className={s.cardTag}>01 / การเตือน</span>
              <h3>
                มีเพื่อนช่วยถาม
                <br />
                ในวันที่จดไม่ครบ
              </h3>
              <p>ใช้ประวัติที่ยืนยันแล้วประกอบการเตือน เฉพาะเมื่อคุณเปิดไว้</p>
              <div className={s.reminderArt}>
                <span className={s.roundAvatar}>พ</span>
                <div>
                  <small>พอใช้ · ตัวอย่างการเตือน</small>
                  <strong>ข้าวเที่ยง 50 บาทเหมือนเดิมไหม?</strong>
                  <div>
                    <span>ใช่ จดเลย</span>
                    <span>แก้ยอด</span>
                    <span>ข้าม</span>
                  </div>
                </div>
              </div>
              <span className={s.pending}>กำลังพัฒนา</span>
            </article>
            <article data-reveal>
              <span className={s.cardTag}>02 / แผนเงิน</span>
              <h3>
                เห็นวันนี้
                <br />
                ไปถึงรอบหน้า
              </h3>
              <p>แนวทางคำนวณเงินหลังกันบิล ค่าใช้จ่ายจำเป็น และเป้าออม</p>
              <div className={s.budgetArt}>
                <span>งบซื้อเพิ่มสมมติ</span>
                <strong>
                  150 <small>บาท</small>
                </strong>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
                <p>จำเป็น ✓ &nbsp; เงินเผื่อ ✓ &nbsp; เป้าออม ✓</p>
              </div>
              <span className={s.pending}>กำลังพัฒนา · ตัวเลขสมมติ</span>
            </article>
            <article data-reveal>
              <span className={s.cardTag}>03 / สิทธิพิเศษ</span>
              <h3>
                ดูโปรให้ครบ
                <br />
                ก่อนเลือกใช้สิทธิ์
              </h3>
              <p>
                เห็นราคา วันใช้ได้ และเงื่อนไข พร้อมป้ายข้อเสนอจากผู้สนับสนุน
              </p>
              <div className={s.couponArt}>
                <span>ข้อเสนอสมมติ / นักศึกษา</span>
                <strong>
                  129 <small>บาท / คน</small>
                </strong>
                <p>หมูกระทะ · ยังไม่เปิดรับสิทธิ์</p>
                <span className={s.cutLine} />
              </div>
              <span className={s.pending}>มีหน้าข้อเสนอตัวอย่างแล้ว</span>
            </article>
            <article data-reveal>
              <span className={s.cardTag}>04 / แต้มรายวัน</span>
              <h3>
                เช็กแผนทีละวัน
                <br />
                ให้เป็นนิสัยของเรา
              </h3>
              <p>แนวทางให้แต้มจากการทบทวนแผน แม้วันนั้นไม่มีรายจ่าย</p>
              <div className={s.pointsArt}>
                <strong>✓</strong>
                <div>
                  <span>เช็กครบแล้ว</span>
                  <b>1 แต้ม / วัน</b>
                  <small>แนวคิดสำหรับเดโม</small>
                </div>
              </div>
              <span className={s.pending}>
                กำลังพัฒนา · ยังไม่เพิ่มแต้มจริง
              </span>
            </article>
          </div>
        </section>
        <section className={s.exploreSection} aria-labelledby="explore-title">
          <div className={s.exploreInner}>
            <div className={s.sectionHeading} data-reveal>
              <p className={s.eyebrow}>แชตที่คุ้นเคย หน้าจอที่ดูต่อได้</p>
              <h2 id="explore-title">
                เรื่องเดียวกัน
                <br />
                <em>ต่อกันได้สองช่องทาง</em>
              </h2>
            </div>
            <div
              className={s.channelSwitch}
              role="group"
              aria-label="เลือกช่องทางดูฟีเจอร์"
            >
              <button aria-pressed={slide < 4} onClick={() => moveSlide(0)}>
                LINE OA · คุยและทบทวน
              </button>
              <button aria-pressed={slide >= 4} onClick={() => moveSlide(4)}>
                MINI App · ดูและจัดการ
              </button>
            </div>
            <div
              ref={rail}
              onScroll={(event) => {
                const element = event.currentTarget;
                const max = element.scrollWidth - element.clientWidth;
                const first = element.children[0] as HTMLElement | undefined;
                const second = element.children[1] as HTMLElement | undefined;
                if (!first || !second || max <= 0) return;
                const step = second.offsetLeft - first.offsetLeft;
                setSlide(
                  element.scrollLeft >= max - 2
                    ? 5
                    : Math.max(
                        0,
                        Math.min(5, Math.round(element.scrollLeft / step)),
                      ),
                );
              }}
              className={s.featureRail}
              tabIndex={0}
              aria-label="รายการฟีเจอร์ เลื่อนแนวนอนเพื่อดูเพิ่มเติม"
            >
              {lineFeatures.map((item, i) => (
                <article className={s.railCard} key={item.short}>
                  <div className={s.railArt}>
                    <span>0{i + 1}</span>
                    <strong>
                      {item.value}
                      <small>{item.unit}</small>
                    </strong>
                    <p>{item.label}</p>
                  </div>
                  <span className={s.pending}>กำลังพัฒนา</span>
                  <h3>{item.short}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
            <div className={s.railControls}>
              <span>เลือกดูฟีเจอร์ {slide + 1} / 6</span>
              <button
                aria-label="ฟีเจอร์ก่อนหน้า"
                disabled={slide === 0}
                onClick={() => moveRail(-1)}
              >
                ←
              </button>
              <button
                aria-label="ฟีเจอร์ถัดไป"
                disabled={slide === 5}
                onClick={() => moveRail(1)}
              >
                →
              </button>
            </div>
          </div>
        </section>
        <section id="for-you" className={s.audienceSection}>
          <div className={s.sectionHeading} data-reveal>
            <p className={s.eyebrow}>โตไปด้วยกัน</p>
            <h2>
              นักศึกษาเริ่มได้
              <br />
              <em>ร้านค้าสร้างโอกาสร่วมกัน</em>
            </h2>
            <p>
              โมเดลที่ตั้งใจให้เครื่องมือหลักใช้ฟรี
              <br />
              และให้ร้านค้าจัดแคมเปญที่วัดผลได้
            </p>
          </div>
          <div
            className={s.audienceSwitch}
            role="group"
            aria-label="เลือกกลุ่มผู้ใช้งาน"
          >
            <button
              aria-pressed={audience === "students"}
              onClick={() => setAudience("students")}
            >
              สำหรับนักศึกษา
            </button>
            <button
              aria-pressed={audience === "partners"}
              onClick={() => setAudience("partners")}
            >
              ร้านค้าและผู้สนับสนุน
            </button>
          </div>
          <div className={s.audienceCards} aria-live="polite">
            {audience === "students" ? (
              <>
                <article>
                  <span className={s.cardTag}>เครื่องมือหลัก</span>
                  <h3>เริ่มดูแลเงิน</h3>
                  <strong className={s.planWord}>
                    ฟรี<span>ตามแผนธุรกิจ</span>
                  </strong>
                  <ul>
                    <li>จดและทบทวนรายจ่าย</li>
                    <li>เห็นแผนเงินก่อนตัดสินใจ</li>
                    <li>ตรวจและยืนยันด้วยตัวเอง</li>
                  </ul>
                  <p>เครื่องมือเหล่านี้อยู่ระหว่างพัฒนา</p>
                </article>
                <article className={s.highlightCard}>
                  <span className={s.cardTag}>สองช่องทาง</span>
                  <h3>LINE อยู่ใกล้ตัว</h3>
                  <strong className={s.planWord}>
                    OA ×<br />
                    MINI App
                  </strong>
                  <ul>
                    <li>คุยและรับการเตือนใน OA</li>
                    <li>ดูรายละเอียดใน MINI App</li>
                    <li>เชื่อมตัวตนผ่าน LINE</li>
                  </ul>
                  <Entry>ลองเปิดรุ่นทดสอบ</Entry>
                </article>
                <article>
                  <span className={s.cardTag}>คุณเป็นคนเลือก</span>
                  <h3>ตามสิ่งที่สำคัญ</h3>
                  <strong className={s.planWord}>
                    พอดี<span>กับแผนของคุณ</span>
                  </strong>
                  <ul>
                    <li>รักษาค่าใช้จ่ายจำเป็น</li>
                    <li>มองทางเลือกภายในงบ</li>
                    <li>โปรมีเงื่อนไขชัดเจน</li>
                  </ul>
                  <p>ตัวอย่างในหน้านี้ไม่มีธุรกรรมจริง</p>
                </article>
              </>
            ) : (
              <>
                <article>
                  <span className={s.cardTag}>ร้านค้า</span>
                  <h3>สร้างข้อเสนอ</h3>
                  <strong className={s.planWord}>
                    เข้าถึง<span>กลุ่มนักศึกษา</span>
                  </strong>
                  <ul>
                    <li>กำหนดราคา วัน และเงื่อนไข</li>
                    <li>รหัสใช้สิทธิ์ให้ร้านยืนยัน</li>
                    <li>รายงานผลแคมเปญแบบรวม</li>
                  </ul>
                  <p>ระบบสิทธิ์จริงรอพัฒนา</p>
                </article>
                <article className={s.highlightCard}>
                  <span className={s.cardTag}>ข้อเสนอธุรกิจสมมติ</span>
                  <h3>เห็นวิธีคำนวณ</h3>
                  <strong className={s.planWord}>
                    100<span>บาท / ตัวอย่าง 20 สิทธิ์ × 5 บาท</span>
                  </strong>
                  <p>
                    ค่าบริการสมมติ คิดจากการใช้ที่ยืนยันแล้ว
                    แยกต้นทุนตามข้อตกลงจริง
                  </p>
                  <Link className={s.primary} href="/business/demo">
                    ดูรายงานเดโม ↗
                  </Link>
                </article>
                <article>
                  <span className={s.cardTag}>ผู้สนับสนุน</span>
                  <h3>ร่วมสร้างนิสัย</h3>
                  <strong className={s.planWord}>
                    สนับสนุน<span>กิจกรรมและรางวัล</span>
                  </strong>
                  <ul>
                    <li>งบรางวัลตามแคมเปญ</li>
                    <li>รายงานผลตามขอบเขตโครงการ</li>
                    <li>ไม่เปิดประวัติรายจ่ายส่วนตัว</li>
                  </ul>
                  <p>เงื่อนไขรอข้อตกลงรายโครงการ</p>
                </article>
              </>
            )}
          </div>
        </section>
        <section className={s.stories} aria-labelledby="stories-title">
          <div className={s.sectionHeading} data-reveal>
            <p className={s.eyebrow}>หนึ่งวันกับพอใช้</p>
            <h2 id="stories-title">
              เรื่องเงินเล็ก ๆ<br />
              <em>ที่เจอได้ทุกวัน</em>
            </h2>
            <p>สถานการณ์สมมติ เพื่อให้เห็นวิธีใช้ในชีวิตนักศึกษา</p>
          </div>
          <div className={s.storyCard}>
            <span className={s.storyTime}>{scenarios[story].time}</span>
            <div key={story} className={s.storyContent}>
              <span className={s.pending}>{scenarios[story].tag}</span>
              <h3>{scenarios[story].title}</h3>
              <p>{scenarios[story].quote}</p>
            </div>
            <div className={s.storyControls}>
              <button
                aria-label="สถานการณ์ก่อนหน้า"
                disabled={story === 0}
                onClick={() => setStory(story - 1)}
              >
                ←
              </button>
              <span aria-live="polite">
                {story + 1} / {scenarios.length}
              </span>
              <button
                aria-label="สถานการณ์ถัดไป"
                disabled={story === 3}
                onClick={() => setStory(story + 1)}
              >
                →
              </button>
            </div>
          </div>
        </section>
        <section id="questions" className={s.faq}>
          <div>
            <p className={s.eyebrow}>ก่อนเริ่มใช้</p>
            <h2>
              สงสัยตรงไหน
              <br />
              <em>มาดูกันก่อน</em>
            </h2>
          </div>
          <div>
            {faqs.map(([question, answer], i) => (
              <details
                name="porchai-faq"
                key={question}
                open={i === 0 ? true : undefined}
              >
                <summary>
                  {question}
                  <span aria-hidden="true">＋</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={s.finalCta} data-reveal>
          <span className={s.brandMark}>พ</span>
          <p className={s.eyebrow}>เริ่มจากวันนี้ ทีละนิดก็ได้</p>
          <h2>
            ให้เรื่องเงิน
            <br />
            <em>เป็นเรื่องที่คุยกันได้</em>
          </h2>
          <p>เปิดหน้าทดสอบพอใช้ แล้วเริ่มเชื่อมต่อด้วยบัญชี LINE</p>
          <div className={s.finalActions}>
            {oaId && (
              <a
                className={s.secondary}
                href={`https://line.me/R/ti/p/${encodeURIComponent(oaId)}`}
              >
                เพิ่มเพื่อนพอใช้ OA <span aria-hidden="true">↗</span>
              </a>
            )}
            <Entry>เปิด MINI App</Entry>
            {liffId && (
              <a
                className={s.secondary}
                href={`https://miniapp.line.me/${encodeURIComponent(liffId)}`}
              >
                เปิดผ่าน LINE <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
          <p className={s.fine}>
            Developing · บัญชีทดสอบต้องมีสิทธิ์ใน channel
          </p>
        </section>
      </main>
      <footer className={s.footer}>
        <div>
          <Link className={s.brand} href="/">
            <Brand />
          </Link>
          <p>เพื่อนช่วยคิด เรื่องใช้เงินของนักศึกษา</p>
          <span className={s.fine}>PorChai · รุ่น Developing</span>
        </div>
        <nav aria-label="สำรวจพอใช้">
          <strong>สำรวจพอใช้</strong>
          <a href="#how">ใช้งานอย่างไร</a>
          <a href="#features">ฟีเจอร์</a>
          <a href="#questions">คำถามที่พบบ่อย</a>
        </nav>
        <nav aria-label="ช่องทางทดสอบ">
          <strong>ช่องทางทดสอบ</strong>
          <Link href="/miniapp">LINE MINI App ↗</Link>
          <Link href="/business/demo">ข้อเสนอสำหรับร้านค้า ↗</Link>
          <a href="#for-you">แนวทางบริการ</a>
        </nav>
        <p className={s.footerBottom}>
          พอใช้ · ตัวอย่างและฟีเจอร์ที่กำลังพัฒนา ไม่มีการทำธุรกรรมจากหน้าแนะนำ
        </p>
      </footer>
      {top && (
        <button
          className={s.backTop}
          aria-label="กลับไปด้านบนสุด"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "instant"
                : "smooth",
            })
          }
        >
          ↑
        </button>
      )}
    </div>
  );
}
