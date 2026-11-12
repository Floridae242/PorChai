import { IBM_Plex_Sans_Thai } from "next/font/google";
import localFont from "next/font/local";

export const fontBody = IBM_Plex_Sans_Thai({
  weight: ["400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-plex-thai",
  display: "swap",
});

export const fontDisplay = localFont({
  src: "../fonts/SanamDeklen_chaya.otf",
  weight: "400",
  variable: "--font-sanamdeklen",
  display: "swap",
  fallback: ["IBM Plex Sans Thai", "sans-serif"],
});
