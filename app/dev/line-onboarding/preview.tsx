"use client";
import { useState } from "react";
import { FlexBubblePreview } from "@/app/dev/line-flex/preview";
import type { FlexMessage } from "@/lib/line/branded-flex";
import type { QuickReplyAction } from "@/lib/line/reply";
import { onboardingHelp } from "@/lib/line/onboarding";
import styles from "./preview.module.css";

export function OnboardingPreview({ message }: { message: FlexMessage }) {
  const [grid, setGrid] = useState(false),
    [notice, setNotice] = useState(""),
    [topic, setTopic] = useState("");
  const bubbles =
    message.contents.type === "carousel"
      ? message.contents.contents
      : [message.contents];
  function act(action: QuickReplyAction) {
    setTopic(
      action.type === "postback"
        ? (onboardingHelp(action.data)?.text ?? "ไม่พบหัวข้อ")
        : "ลิงก์ที่จะเปิดใน LINE: " + action.uri,
    );
    setNotice("พรีวิวเท่านั้น ไม่ได้ส่งข้อความ ไม่ได้บันทึกข้อมูล");
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.brand}>
            พอใช้ <span>PORCHAI</span>
          </p>
          <h1>เลื่อนนิดเดียว รู้จักพอใช้</h1>
          <p>Flex Carousel ต้อนรับ · 10 เรื่องที่เริ่มทำได้ในแชต LINE</p>
        </div>
        <span className={styles.draft}>พรีวิวก่อน commit</span>
      </header>
      <div className={styles.toolbar}>
        <div>
          <button aria-pressed={!grid} onClick={() => setGrid(false)}>
            เลื่อนแบบ LINE
          </button>
          <button aria-pressed={grid} onClick={() => setGrid(true)}>
            ดูครบทุกการ์ด
          </button>
        </div>
        <p>ตัวอย่างคำพูดบนการ์ดไม่ใช่ข้อมูลที่บันทึกแล้ว · กดปุ่มเพื่อดูวิธีใช้ได้</p>
      </div>
      <section
        className={`${styles.cards} ${grid ? styles.grid : styles.carousel}`}
        aria-label="การ์ดต้อนรับพอใช้ เลื่อนแนวนอนได้"
      >
        {bubbles.map((bubble, i) => (
          <div className={styles.card} key={i}>
            <FlexBubblePreview bubble={bubble} onAction={act} />
          </div>
        ))}
      </section>
      <p className={styles.note}>
        หน้าพรีวิวนี้ใช้ JSON เดียวกับข้อความตอนเพิ่มเพื่อน ปุ่มเป็นตัวอย่าง ไม่ส่งคำสั่งจริง
        การแสดงผลใน LINE อาจต่างตามอุปกรณ์
      </p>
      {topic && (
        <section className={styles.topic} aria-live="polite">
          <h2>กดแล้วจะเห็นอะไร</h2>
          <p>{topic}</p>
          <small>{notice}</small>
        </section>
      )}
      <details className={styles.json}>
        <summary>ดู Flex JSON สำหรับ Simulator</summary>
        <pre>{JSON.stringify(message.contents, null, 2)}</pre>
      </details>
    </main>
  );
}
