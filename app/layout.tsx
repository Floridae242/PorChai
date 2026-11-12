import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { LiffStateRedirect } from "./liff-state-redirect";

const sanamDeklen = localFont({
  src: "./fonts/SanamDeklen_chaya.otf",
  variable: "--font-sanam-deklen",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "พอใช้ · PorChai",
  description: "จดรายจ่ายและช่วยคิดก่อนจ่ายสำหรับนักศึกษา",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${sanamDeklen.variable} h-full antialiased`}>
      <body className={`${sanamDeklen.className} min-h-full flex flex-col`}>
        <LiffStateRedirect />
        {children}
      </body>
    </html>
  );
}
