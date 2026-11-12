"use client";

import { useState } from "react";
import styles from "../landing.module.css";

const scenes = [
  {
    tab: "จดให้ง่าย",
    input: "ข้าว 45",
    title: "ข้าว · 45 บาท",
    amount: "75 บาท",
    text: "ใช้ไปแล้ว 45 / 120 บาท",
    action: "ตัวอย่างผลหลังยืนยันรายการ",
    note: "เห็นรายการและงบที่เหลือในบทสนทนาเดียว",
  },
  {
    tab: "เตือนอย่างเข้าใจ",
    input: "วันนี้ยังไม่ได้จดข้าวเที่ยงเลย",
    title: "ข้าวเที่ยงเหมือนเดิมไหม?",
    amount: "ประมาณ 50 บาท",
    text: "ถ้าจ่ายแล้ว เลือกยืนยัน แก้ยอด หรือข้ามได้",
    action: "ตัวอย่างเตือนเมื่อเปิดใช้งาน",
    note: "เตือนจากประวัติที่เคยจด และปิดได้เสมอ",
  },
  {
    tab: "คิดก่อนจ่าย",
    input: "ศุกร์นี้อยากกินหมูกระทะ 199 บาท แต่ต้องกันค่าเดินทางและเงินออมไว้",
    title: "ลองก่อนจ่าย · หมูกระทะ (ศุกร์)",
    amount: "เกินงบ 49 บาท",
    text: "สมมติมีงบซื้อเพิ่ม 150 บาท ลองเลือกมื้อในงบหรือเลื่อนนัด",
    action: "การลองยังไม่เปลี่ยนยอดเงินจริง",
    note: "เห็นส่วนที่ขาด ก่อนตัดสินใจด้วยตัวเอง",
  },
] as const;

export default function ChatPreview() {
  const [index, setIndex] = useState(0);
  const scene = scenes[index];
  return (
    <div className={styles.demoWrap}>
      <div className={styles.phone}>
        <div className={styles.phoneTop}>
          <span>09:41</span>
          <span aria-hidden="true">● ▰</span>
        </div>
        <div className={styles.chatHeader}>
          <span className={styles.avatar}>พ</span>
          <div>
            <strong>พอใช้</strong>
            <small>เพื่อนช่วยคิด เรื่องใช้เงิน</small>
          </div>
          <span className={styles.chatMenu} aria-hidden="true">
            •••
          </span>
        </div>
        <div className={styles.chatBody} aria-live="polite" aria-atomic="true">
          <p className={styles.dayLabel}>บทสนทนาตัวอย่าง</p>
          <p className={styles.userBubble}>{scene.input}</p>
          <div className={styles.botRow}>
            <span className={styles.smallAvatar}>พ</span>
            <div className={styles.response}>
              <span className={styles.responseLabel}>สถานการณ์สมมติ</span>
              <h3>{scene.title}</h3>
              {index === 0 && (
                <>
                  <span className={styles.chatCategory}>อาหาร</span>
                  <p className={styles.balanceLabel}>วันนี้ใช้ได้อีก</p>
                </>
              )}
              {index === 2 && (
                <dl className={styles.comparison}>
                  <div>
                    <dt>ราคา</dt>
                    <dd>199 บาท</dd>
                  </div>
                  <div>
                    <dt>ซื้อเพิ่มได้ไม่เกิน</dt>
                    <dd>150 บาท</dd>
                  </div>
                </dl>
              )}
              <p
                className={`${styles.amount} ${index === 2 ? styles.overBudget : ""}`}
              >
                {scene.amount}
              </p>
              {index === 0 && (
                <div className={styles.chatProgress} aria-hidden="true">
                  <span />
                </div>
              )}
              <p>{scene.text}</p>
              <div className={styles.responseAction}>{scene.action}</div>
            </div>
          </div>
          <p className={styles.demoNote}>
            ภาพจำลองเพื่ออธิบายแนวคิด
            <br />
            ยังไม่ใช่แชตหรือธุรกรรมจริง
          </p>
        </div>
        <div className={styles.phoneBottom}>
          <span aria-hidden="true">＋</span>
          <span>พิมพ์เรื่องเงินของวันนี้…</span>
          <span aria-hidden="true">↗</span>
        </div>
      </div>
      <div className={styles.sceneTabs} aria-label="เลือกดูบทสนทนาตัวอย่าง">
        {scenes.map((item, i) => (
          <button
            key={item.tab}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <p className={styles.sceneCaption}>{scene.note}</p>
    </div>
  );
}
