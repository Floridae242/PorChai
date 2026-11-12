"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { initializeLiff } from "@/lib/line/liff-client";
import { verifyMiniAppUser, type MiniAppUser } from "@/lib/line/miniapp-user";
import { demoCampaign } from "@/lib/campaigns/demo";
import { formatBaht } from "@/lib/campaigns/money";
import { appReturnPath } from "@/lib/liff/login-redirect";

type Connection =
  | { status: "loading" }
  | { status: "login" }
  | { status: "ready"; user: MiniAppUser }
  | { status: "error"; message: string };

export default function MiniApp() {
  const oaId = process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID;
  const oaUrl = oaId
    ? `https://line.me/R/ti/p/${encodeURIComponent(oaId)}`
    : null;
  const [connection, setConnection] = useState<Connection>({
    status: "loading",
  });
  const [section, setSection] = useState<"home" | "offers" | "about">("home");
  const [details, setDetails] = useState(false);

  useEffect(() => {
    let active = true;
    async function connect() {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error("ยังไม่ได้ตั้งค่าการเชื่อมต่อ LINE กรุณาติดต่อทีมพอใช้");
        const liff = await initializeLiff(liffId);
        if (!liff.isLoggedIn()) {
          if (active) setConnection({ status: "login" });
          return;
        }
        const user = await verifyMiniAppUser(liff.getIDToken());
        const returnTo = appReturnPath(
          new URLSearchParams(window.location.search).get("returnTo"),
        );
        if (active && returnTo) {
          window.location.replace(returnTo);
          return;
        }
        if (active) setConnection({ status: "ready", user });
      } catch (error) {
        if (active)
          setConnection({
            status: "error",
            message:
              error instanceof Error ? error.message : "เชื่อมต่อ LINE ไม่สำเร็จ",
          });
      }
    }
    void connect();
    return () => {
      active = false;
    };
  }, []);

  async function login() {
    try {
      const liff = await initializeLiff(process.env.NEXT_PUBLIC_LIFF_ID!);
      const callback = new URL("/miniapp", window.location.origin);
      const returnTo = appReturnPath(
        new URLSearchParams(window.location.search).get("returnTo"),
      );
      if (returnTo) callback.searchParams.set("returnTo", returnTo);
      liff.login({
        redirectUri: callback.href,
      });
    } catch {
      setConnection({
        status: "error",
        message: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
      });
    }
  }

  const button =
    "min-h-12 rounded-2xl px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800";
  return (
    <div className="min-h-dvh bg-[#f5f7f2] text-slate-900">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        <header className="px-5 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="rounded-lg py-2 text-sm font-semibold text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              พอใช้ · PorChai ↗
            </Link>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[10px] text-emerald-900">
              Developing
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            คิดก่อนจ่าย ใช้ได้พอดี
          </h1>
          <p className="mt-3 text-slate-600">ตัวช่วยเรื่องเงินสำหรับชีวิตนักศึกษา</p>
        </header>
        <main className="flex-1 space-y-5 px-5 pb-8">
          {connection.status === "loading" && (
            <section aria-busy="true" className="rounded-3xl bg-white p-6">
              <div aria-hidden="true" className="mb-5 flex gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-800" />
                <span className="h-3 w-3 rounded-full bg-emerald-200" />
                <span className="h-3 w-3 rounded-full bg-emerald-100" />
              </div>
              <p role="status" className="font-semibold">
                กำลังเชื่อมต่อ LINE…
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                กำลังเริ่ม LIFF และตรวจข้อมูลยืนยันตัวตนกับเซิร์ฟเวอร์
              </p>
            </section>
          )}
          {connection.status === "login" && (
            <section className="overflow-hidden rounded-3xl bg-white">
              <div className="bg-emerald-900 p-6 text-white">
                <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-lime-100 text-4xl font-bold text-emerald-950">
                  พ
                </span>
                <h2 className="text-2xl font-bold">
                  เริ่มจากวันนี้
                  <br />
                  ทีละนิดก็ได้
                </h2>
                <p className="mt-3 text-sm leading-7 text-emerald-100">
                  เพื่อนช่วยคิด เรื่องใช้เงินของนักศึกษา
                </p>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-bold">เริ่มใช้งานด้วย LINE</h3>
                <p className="my-4 text-sm leading-7 text-slate-600">
                  เชื่อมบัญชี LINE เพื่อเปิดหน้าทดสอบพอใช้ ระบบตรวจ ID token
                  ฝั่งเซิร์ฟเวอร์ก่อนแสดงหน้าบัญชี
                </p>
                <button
                  onClick={login}
                  className={`${button} w-full bg-emerald-800 text-white`}
                >
                  เข้าสู่ระบบ LINE ↗
                </button>
                {oaUrl && (
                  <a
                    href={oaUrl}
                    className={`${button} mt-3 flex w-full justify-center border border-emerald-800 text-emerald-900`}
                  >
                    เพิ่มเพื่อนพอใช้ OA ↗
                  </a>
                )}
                <p className="mt-4 text-xs leading-6 text-slate-500">
                  Developing ใช้บัญชีที่มีสิทธิ์ทดสอบใน channel ขณะนี้มีหน้าโปรสมมติ
                  ฟีเจอร์การเงินจริงยังอยู่ระหว่างพัฒนา
                </p>
              </div>
            </section>
          )}
          {connection.status === "error" && (
            <section className="rounded-3xl bg-white p-6">
              <p role="alert">{connection.message}</p>
              <button
                onClick={() => window.location.reload()}
                className={`${button} mt-4 border border-slate-400`}
              >
                ลองใหม่
              </button>
            </section>
          )}
          {connection.status === "ready" && (
            <>
              <p role="status" className="text-sm text-emerald-800">
                เชื่อมต่อ LINE แล้ว · สวัสดี
                {connection.user.name ? ` ${connection.user.name}` : "ครับ"}
              </p>
              {section === "home" ? (
                <section aria-labelledby="home-title" className="space-y-4">
                  <div className="rounded-3xl bg-emerald-900 p-6 text-white">
                    <p className="text-xs text-emerald-100">
                      พื้นที่ของคุณ · รุ่นทดสอบ
                    </p>
                    <h2 id="home-title" className="mt-3 text-2xl font-bold">
                      ยินดีต้อนรับสู่พอใช้
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-emerald-100">
                      เชื่อมตัวตนแล้ว ลองดูข้อเสนอตัวอย่างและแนวทางการใช้งานได้เลย
                    </p>
                    <button
                      onClick={() => setSection("offers")}
                      className={`${button} mt-5 bg-lime-100 text-emerald-950`}
                    >
                      ดูโปรตัวอย่าง ↗
                    </button>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6">
                    <p className="text-xs font-semibold text-emerald-800">
                      แผนเงินและรายการ
                    </p>
                    <h3 className="mt-3 text-xl font-bold">
                      ยังไม่มีข้อมูลแผนเงินจริง
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      ระบบจดรายจ่ายและแผนเงินยังไม่เชื่อมฐานข้อมูล
                      จึงยังไม่แสดงยอดคงเหลือหรือสร้างรายการในหน้านี้
                    </p>
                  </div>
                  <h3 className="pt-2 text-lg font-bold">
                    พอใช้กำลังเตรียมอะไรให้คุณ
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      "จดรายจ่าย",
                      "เตือนให้ทบทวน",
                      "ช่วยคิดก่อนจ่าย",
                      "เช็กแผนและแต้ม",
                    ].map((title) => (
                      <div
                        key={title}
                        className="rounded-2xl border border-emerald-100 bg-white p-4"
                      >
                        <p className="text-sm font-semibold">{title}</p>
                        <span className="mt-2 block text-[10px] text-slate-500">
                          กำลังพัฒนา
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : section === "offers" ? (
                <section aria-labelledby="offers-title" className="space-y-4">
                  <h2 id="offers-title" className="text-xl font-bold">
                    โปรสำหรับนักศึกษา
                  </h2>
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                    <p className="font-semibold">ยังไม่มีโปรที่เปิดรับสิทธิ์</p>
                    <p className="mt-2 text-sm leading-6">
                      ระหว่างนี้ดูข้อเสนอตัวอย่างด้านล่างได้ ยังไม่เชื่อมแผนเงินส่วนตัวของคุณ
                    </p>
                  </div>
                  <article className="rounded-3xl bg-white p-6 shadow-sm">
                    <p className="text-xs font-bold text-emerald-800">
                      ข้อเสนอจากผู้สนับสนุน · ข้อมูลสมมติ
                    </p>
                    <h3 className="mt-3 text-2xl font-bold">
                      {demoCampaign.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      {demoCampaign.merchantLabel}
                    </p>
                    <p className="my-5 text-3xl font-bold">
                      {formatBaht(demoCampaign.priceSatang)}{" "}
                      <span className="text-sm font-normal">/ คน</span>
                    </p>
                    <p className="text-sm leading-6 text-slate-600">
                      ราคาและเงื่อนไขเป็นตัวอย่าง ยังไม่ใช่คูปองที่ใช้ซื้อได้
                      และยังไม่ใช่คำแนะนำตามงบของคุณ
                    </p>
                    <button
                      aria-expanded={details}
                      aria-controls="offer-details"
                      onClick={() => setDetails(!details)}
                      className={`${button} mt-4 w-full border border-emerald-800 text-emerald-900`}
                    >
                      {details ? "ซ่อนเงื่อนไข" : "ดูเงื่อนไขตัวอย่าง"}
                    </button>
                    {details && (
                      <ul
                        id="offer-details"
                        className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6"
                      >
                        <li>ราคาเสนอ 129 บาทต่อคน รวมค่าใช้จ่ายทั้งหมดตามตัวอย่าง</li>
                        <li>เสนอให้ใช้วันอังคาร วันเริ่ม/หมดอายุและสาขายังรอยืนยัน</li>
                        <li>ยังไม่เปิดรับสิทธิ์ จึงไม่มีการออกโค้ดหรือตัดยอดเงิน</li>
                      </ul>
                    )}
                  </article>
                </section>
              ) : (
                <section className="rounded-3xl bg-white p-6">
                  <h2 className="text-xl font-bold">รู้จักพอใช้</h2>
                  <p className="mt-4 leading-7">
                    พอใช้ตั้งใจช่วยให้จดรายจ่ายง่ายขึ้น และช่วยคิดก่อนจ่ายจากแผนเงินของตัวเอง
                    นักศึกษาใช้เครื่องมือหลักฟรี
                  </p>
                  <p className="mt-4 leading-7">
                    หน้านี้เป็นรุ่นทดสอบส่วนโปรร้านค้า ฟีเจอร์จดรายจ่าย แผนเงิน
                    และรับคูปองจริงยังอยู่ระหว่างพัฒนา
                  </p>
                </section>
              )}
            </>
          )}
        </main>
        {connection.status === "ready" && (
          <nav
            aria-label="เมนูพอใช้"
            className="sticky bottom-0 grid grid-cols-3 gap-1 border-t border-slate-200 bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <button
              onClick={() => setSection("home")}
              aria-pressed={section === "home"}
              className={`${button} text-xs ${section === "home" ? "bg-emerald-100 text-emerald-950" : "text-slate-600"}`}
            >
              หน้าหลัก
            </button>
            <button
              onClick={() => setSection("offers")}
              aria-pressed={section === "offers"}
              className={`${button} text-xs ${section === "offers" ? "bg-emerald-100 text-emerald-950" : "text-slate-600"}`}
            >
              โปรนักศึกษา
            </button>
            <button
              onClick={() => setSection("about")}
              aria-pressed={section === "about"}
              className={`${button} text-xs ${section === "about" ? "bg-emerald-100 text-emerald-950" : "text-slate-600"}`}
            >
              เกี่ยวกับพอใช้
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
