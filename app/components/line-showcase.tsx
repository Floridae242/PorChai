"use client";

import { useEffect, useRef, useState } from "react";
import s from "./marketing.module.css";

export const lineFeatures = [
  {
    title: "พิมพ์เหมือนคุยกัน",
    short: "จดรายจ่าย",
    text: "เริ่มจากข้อความสั้น ๆ แล้วตรวจชื่อรายการ หมวด และยอดก่อนยืนยัน",
    message: "ข้าวเที่ยง 50",
    label: "รายการรอยืนยัน",
    value: "50",
    unit: "บาท",
    detail: "ข้าวเที่ยง · อาหาร · วันนี้",
  },
  {
    title: "ส่งรูป แล้วตรวจอีกครั้ง",
    short: "อ่านใบเสร็จ",
    text: "ให้ OCR ช่วยอ่านชื่อร้าน ยอดและวันที่ คุณแก้ข้อมูลก่อนกดบันทึกได้",
    message: "ส่งรูปใบเสร็จ",
    label: "ร่างจากใบเสร็จ",
    value: "65",
    unit: "บาท",
    detail: "ร้านอาหาร · ตรวจยอดก่อนบันทึก",
  },
  {
    title: "ลืมจด มีเพื่อนช่วยทบทวน",
    short: "เตือนให้ทบทวน",
    text: "เมื่อเปิดการเตือนและมีประวัติเพียงพอ เลือกยืนยัน แก้ยอด หรือข้ามรายการประจำได้",
    message: "วันนี้ยังไม่ได้จดมื้อเที่ยงเลย",
    label: "ข้าวเที่ยงเหมือนเดิมไหม?",
    value: "50",
    unit: "บาท",
    detail: "ประมาณจากประวัติสมมติ · ปิดการเตือนได้",
  },
  {
    title: "ลองคิด ก่อนจ่ายจริง",
    short: "คิดก่อนจ่าย",
    text: "เทียบสิ่งที่อยากซื้อกับแผนเงิน เห็นส่วนที่ขาดและทางเลือก โดยยังกันค่าใช้จ่ายจำเป็นไว้",
    message: "หมูกระทะ 199 บาท ไหวไหม?",
    label: "งบซื้อเพิ่มสมมติ 150 บาท",
    value: "49",
    unit: "บาทเกินงบ",
    detail: "เลือกร้านในงบ หรือเลื่อนนัด",
  },
  {
    title: "โปรที่ดูเงื่อนไขได้ครบ",
    short: "โปรนักศึกษา",
    text: "เปิด MINI App เพื่อดูราคา วันใช้ได้ และเงื่อนไข ข้อเสนอจากผู้สนับสนุนมีป้ายกำกับ",
    message: "มีโปรนักศึกษาไหม?",
    label: "ข้อเสนอจากผู้สนับสนุน · สมมติ",
    value: "129",
    unit: "บาท / คน",
    detail: "ตัวอย่างเท่านั้น · ยังไม่เปิดรับสิทธิ์",
  },
  {
    title: "ทบทวนวันนี้ ทีละนิด",
    short: "เช็กแผนและแต้ม",
    text: "แนวทางรับแต้มจากการเช็กแผนรายวัน พร้อมดูของและเงื่อนไขก่อนแลกใน MINI App",
    message: "วันนี้เช็กแผนครบแล้ว",
    label: "แนวคิดแต้มรายวัน",
    value: "1",
    unit: "แต้ม / วัน",
    detail: "กำลังพัฒนา · ยังไม่มีการเพิ่มแต้มจริง",
  },
] as const;

export function LinePreview({ index }: { index: number }) {
  const item = lineFeatures[index];
  return (
    <div className={s.previewPhone}>
      <div className={s.phoneStatus}>
        <span>9:41</span>
        <span aria-hidden="true">● ● ▮</span>
      </div>
      <div className={s.phoneHeader}>
        <span aria-hidden="true">‹</span>
        <strong>พอใช้</strong>
        <span aria-hidden="true">☰</span>
      </div>
      <div className={s.phoneContent} key={index}>
        <span className={s.sampleLabel}>สถานการณ์สมมติ · กำลังพัฒนา</span>
        <p className={s.userMessage}>{item.message}</p>
        <div className={s.botMessage}>
          <span className={s.botAvatar}>พ</span>
          <div className={s.botCard}>
            <p>{item.label}</p>
            {index === 1 && (
              <div className={s.receipt} aria-hidden="true">
                <span>ใบเสร็จตัวอย่าง</span>
                <i />
                <i />
                <i />
                <b>65.00</b>
              </div>
            )}
            <strong className={index === 3 ? s.warningValue : s.previewValue}>
              {item.value} <small>{item.unit}</small>
            </strong>
            <p>{item.detail}</p>
            {index === 2 && (
              <div className={s.visualChoices} aria-hidden="true">
                <span>ใช่ จดเลย</span>
                <span>แก้ยอด</span>
                <span>ข้าม</span>
              </div>
            )}
            {index === 3 && (
              <dl className={s.moneyRows}>
                <div>
                  <dt>อยากใช้</dt>
                  <dd>199 บาท</dd>
                </div>
                <div>
                  <dt>ซื้อเพิ่มได้</dt>
                  <dd>150 บาท</dd>
                </div>
              </dl>
            )}
            {index === 4 && (
              <div className={s.offerStamp}>ยังไม่ใช่คูปองที่ใช้ซื้อได้</div>
            )}
            {index === 5 && (
              <div className={s.pointTrack} aria-hidden="true">
                ✓ — ✓ — ○ — ○ — ○
              </div>
            )}
          </div>
        </div>
        <p className={s.previewDisclaimer}>
          ตัวอย่างเพื่ออธิบายแนวคิด
          <br />
          ไม่มีการบันทึกหรือเปลี่ยนยอดเงินจริง
        </p>
      </div>
      <div className={s.richMenu} aria-hidden="true">
        <span>จดรายจ่าย</span>
        <span>ลองก่อนจ่าย</span>
        <span>เปิด MINI App ↗</span>
      </div>
      <div className={s.phoneInput} aria-hidden="true">
        ＋ <span>พิมพ์เรื่องเงินของวันนี้…</span> ☺
      </div>
    </div>
  );
}

export default function LineShowcase() {
  const [active, setActive] = useState(0);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia(
      "(min-width: 960px) and (prefers-reduced-motion: no-preference)",
    );
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!desktop.matches || !section.current) return;
      const rect = section.current.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (rect.top > 0 || rect.bottom < window.innerHeight || span <= 0) return;
      setActive(Math.min(5, Math.floor(Math.max(0, -rect.top / span) * 6)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  function choose(index: number) {
    setActive(index);
    if (
      window.matchMedia(
        "(min-width: 960px) and (prefers-reduced-motion: no-preference)",
      ).matches &&
      section.current
    ) {
      const rect = section.current.getBoundingClientRect();
      window.scrollTo({
        top:
          scrollY +
          rect.top +
          (rect.height - innerHeight) * ((index + 0.3) / 6),
        behavior: "instant",
      });
    }
  }
  return (
    <section
      ref={section}
      id="how"
      className={s.showcase}
      aria-labelledby="showcase-title"
    >
      <div className={s.showcaseSticky}>
        <div className={s.showcaseInner}>
          <div className={s.showcaseCopy}>
            <p className={s.eyebrow}>
              LINE OA × LINE MINI APP <span>0{active + 1} / 06</span>
            </p>
            <h2 id="showcase-title">
              เรื่องเงินของคุณ
              <br />
              <em>คุยให้เข้าใจง่ายขึ้น</em>
            </h2>
            <p className={s.sectionIntro}>
              ดูแนวทางที่พอใช้กำลังพัฒนา เลื่อนหรือเลือกหัวข้อเพื่อดูตัวอย่าง
            </p>
            <div className={s.featureButtons} aria-label="เลือกตัวอย่างฟีเจอร์">
              {lineFeatures.map((item, i) => (
                <button
                  key={item.short}
                  onClick={() => choose(i)}
                  aria-pressed={active === i}
                  aria-controls="feature-preview"
                >
                  <span>0{i + 1}</span>
                  <span>
                    <strong>{item.short}</strong>
                    {active === i && <small>{item.text}</small>}
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
          <div
            id="feature-preview"
            className={s.showcaseVisual}
            role="region"
            aria-label={`ตัวอย่าง: ${lineFeatures[active].short}`}
          >
            <LinePreview index={active} />
          </div>
        </div>
      </div>
    </section>
  );
}
