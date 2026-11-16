/**
 * Writes tests/fixtures/mock-slip.png when it is missing: a SAMPLE payment slip for the PM demo's
 * "ส่งสลิป" step. Every value is made up and the image says so on its face (no bank name or logo, no QR,
 * a "ตัวอย่าง · ไม่ใช่สลิปจริง" banner and watermark), so it can never pass for a real transfer.
 * The demo's OCR stub (DEMO_SLIP in line-oa-bot.ts) "reads" the same merchant and amount.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

export const MOCK_SLIP_PATH = path.join(__dirname, "..", "..", "fixtures", "mock-slip.png");

const SLIP_HTML = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
  body{margin:0;font-family:"Noto Sans Thai","Leelawadee UI",system-ui,sans-serif;background:#eef6f3}
  .slip{position:relative;width:400px;padding:24px 26px 22px;background:linear-gradient(160deg,#f4fbf8,#dff0ea);overflow:hidden}
  .wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:92px;font-weight:800;color:rgba(20,90,70,.07);transform:rotate(-24deg);pointer-events:none}
  .banner{background:#ffd54a;color:#3a2a00;font-weight:700;font-size:13px;text-align:center;border-radius:8px;padding:5px 8px;margin-bottom:16px}
  .ok{display:flex;align-items:center;gap:12px}
  .tick{width:36px;height:36px;border-radius:50%;background:#2bb38a;color:#fff;font-size:22px;display:flex;align-items:center;justify-content:center}
  h1{margin:0;font-size:21px}
  .muted{color:#4b5b57;font-size:14px}
  hr{border:none;border-top:1px solid #b9cfc8;margin:14px 0}
  .party{display:flex;gap:12px;align-items:flex-start;margin:6px 0}
  .dot{width:36px;height:36px;border-radius:50%;background:#7aa79a;flex:none}
  .name{font-weight:700;font-size:17px}
  .arrow{margin:2px 0 2px 10px;color:#6b7f7a}
  .row{display:flex;justify-content:space-between;align-items:baseline;margin:8px 0}
  .amt{font-size:30px;font-weight:800}
  .ref{font-family:ui-monospace,Consolas,monospace;font-size:14px}
</style></head><body><div class="slip">
  <div class="wm">ตัวอย่าง</div>
  <div class="banner">ตัวอย่างสำหรับทดสอบระบบ · ไม่ใช่สลิปจริง</div>
  <div class="ok"><div class="tick">✓</div><div><h1>จ่ายบิลสำเร็จ</h1><div class="muted">11 พ.ย. 69 &nbsp;12:30 น.</div></div></div>
  <hr>
  <div class="party"><div class="dot"></div><div><div class="name">ผู้ใช้เดโม พอใช้</div><div class="muted">ธนาคารตัวอย่าง · xxx-x-x0000-x</div></div></div>
  <div class="arrow">↓</div>
  <div class="party"><div class="dot" style="background:#e0a33a"></div><div><div class="name">ร้านเบอร์เกอร์</div><div class="muted">ร้านค้าตัวอย่าง · DEMO-SHOP-01</div></div></div>
  <hr>
  <div class="row"><span class="muted">จำนวน:</span><span><span class="amt">50.00</span> บาท</span></div>
  <div class="row"><span class="muted">ค่าธรรมเนียม:</span><span>0.00 บาท</span></div>
  <div class="row"><span class="muted">เลขที่รายการ:</span><span class="ref">DEMO-0000-0001</span></div>
</div></body></html>`;

export async function ensureMockSlip(): Promise<string> {
  if (existsSync(MOCK_SLIP_PATH)) return MOCK_SLIP_PATH;
  mkdirSync(path.dirname(MOCK_SLIP_PATH), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    await page.setContent(SLIP_HTML);
    await page.locator(".slip").screenshot({ path: MOCK_SLIP_PATH });
  } finally {
    await browser.close();
  }
  return MOCK_SLIP_PATH;
}
