import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { checkpoint, isolate } from "./helpers";

type Node = { type?: string; text?: string; layout?: string; action?: { label?: string }; contents?: Node[] | Node; header?: Node; body?: Node; footer?: Node; };
type Transcript = { schemaVersion: number; mode: string; transcript: { title: string; input: string; messages: Node[] }[] };

test("C01 · เล่นบทสนทนาจาก signed webhook ที่ตรวจผ่านจริงบนเครื่อง", async ({ page }, info) => {
  const data = JSON.parse(readFileSync("artifacts/presentation/chat-transcript.json", "utf8")) as Transcript;
  expect(data.schemaVersion).toBe(1);
  expect(data.mode).toBe("local-webhook-db");
  expect(data.transcript.length).toBeGreaterThan(20);
  await isolate(page);
  await page.setContent(`<!doctype html><html lang="th"><meta charset="utf-8"><title>PorChai · Workflow Replay</title><style>
  *{box-sizing:border-box}body{margin:0;background:#ecf3e9;color:#163e2e;font:16px system-ui,sans-serif;padding:60px 12px 100px}h1{font-size:22px}aside{font-size:12px;line-height:1.7}article{margin:14px 0;white-space:pre-wrap;overflow-wrap:anywhere}article.user{margin-left:55px;background:#c4e7ad;padding:12px;border-radius:18px}article.bot{background:white;padding:14px;border-radius:18px}.carousel{display:flex;overflow:auto;gap:12px}.carousel>div{min-width:290px;max-width:320px;background:#fff;border:1px solid #cddcc9;border-radius:12px;padding:12px}.cardtext{margin:8px 0;line-height:1.65}button{background:#24583b;color:white;border:0;border-radius:10px;padding:12px;margin:4px 0;width:100%;font:inherit}form{position:fixed;bottom:0;left:0;right:0;padding:8px;background:white;display:flex;gap:8px}textarea{flex:1;min-width:0;font:inherit}form button{width:70px}#messages{padding-bottom:30px}
  </style><h1>น้องพอใช้ · แชตสาธิต</h1><aside>REPLAY จาก webhook และฐานข้อมูลทดสอบบนเครื่อง<br>จำลอง LINE delivery / identity และปิด LLM · ไม่ใช่แอป LINE จริง<br>MINI App ในเดโมถัดไปใช้ mock session แยกกัน</aside><section id="messages" aria-live="polite"></section><form><textarea aria-label="ข้อความถึงน้องพอใช้"></textarea><button type="submit">ส่ง</button></form><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();const a=document.createElement('article');a.className='user';a.textContent=document.querySelector('textarea').value;document.querySelector('#messages').append(a);document.querySelector('textarea').value='';};</script></html>`);
  for (const step of data.transcript) {
    await test.step(step.title, async () => {
      await page.getByRole("textbox", { name: "ข้อความถึงน้องพอใช้" }).fill(step.input);
      await page.getByRole("button", { name: "ส่ง", exact: true }).click();
      await page.evaluate(messages => {
        const root = document.querySelector("#messages")!;
        // Semantic preview of real response JSON. Text always goes through textContent.
        function render(node: Node): HTMLElement {
          const el = document.createElement("div");
          if (node.type === "carousel") el.className = "carousel";
          if (node.text) { el.textContent = node.text; el.className = "cardtext"; }
          if (node.action?.label) { const button = document.createElement("button"); button.type = "button"; button.textContent = node.action.label; button.disabled = true; el.append(button); }
          for (const part of [node.header, node.body, node.footer]) if (part) el.append(render(part));
          if (Array.isArray(node.contents)) for (const child of node.contents) el.append(render(child));
          else if (node.contents) el.append(render(node.contents));
          return el;
        }
        for (const message of messages) { const article = document.createElement("article"); article.className = "bot"; article.append(render(message)); root.append(article); }
        root.lastElementChild?.scrollIntoView({ block: "end" });
      }, step.messages);
      await expect(page.locator("article.bot").last()).not.toBeEmpty();
      await checkpoint(page, info, step.title);
    });
  }
});
