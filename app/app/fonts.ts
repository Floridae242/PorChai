import { IBM_Plex_Sans_Thai } from "next/font/google";
import localFont from "next/font/local";

export const fontBody = IBM_Plex_Sans_Thai({
  weight: ["400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-body",
  display: "swap",
});

export const fontDisplay = localFont({
  src: "../fonts/SanamDeklen_chaya.otf",
  weight: "400",
  variable: "--font-display",
  display: "swap",
  fallback: ["IBM Plex Sans Thai", "sans-serif"],
});
