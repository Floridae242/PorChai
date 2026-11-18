// Builds docs/pitch/porchai-pitch-deck.html from docs/pitch/deck.src.html (npm run pitch:build).
// Inlines the SanamDeklen display font (app/fonts) and the mascot PNGs (public/mascot) as data URIs,
// so the deck is ONE file that opens offline from a USB stick or the desktop. Only the body font
// (IBM Plex Sans Thai) comes from Google Fonts, with system Thai fonts as the fallback.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const dataUri = (path, mime) => `data:${mime};base64,${readFileSync(join(root, path)).toString("base64")}`;

let html = readFileSync(join(here, "deck.src.html"), "utf8");
html = html.replaceAll("__FONT_SANAM__", dataUri("app/fonts/SanamDeklen_chaya.otf", "font/otf"));

const used = new Set([...html.matchAll(/__ASSET_([A-Za-z]+)__/g)].map((m) => m[1]));
for (const name of used) {
  html = html.replaceAll(`__ASSET_${name}__`, dataUri(`public/mascot/${name}.png`, "image/png"));
}

const out = join(here, "porchai-pitch-deck.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB, mascots: ${[...used].sort().join(", ")})`);
