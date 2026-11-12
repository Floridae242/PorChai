import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Tailwind generates colour utilities from `@theme inline` (app/app/theme.css): text-ok, bg-warn-bg,
// bg-reward ... The raw token names (status-*, accent-*) are NOT utilities and render nothing.
const BAD_CLASS = /\b(bg|text|border|ring|fill|stroke)-(status|accent)-/;
const DIRS = [join("app", "app"), join("app", "shop"), "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("tailwind class names", () => {
  it("no invalid (bg|text|border|ring|fill|stroke)-(status|accent)- utilities", () => {
    const offenders: string[] = [];
    for (const d of DIRS) {
      for (const f of walk(join(process.cwd(), d))) {
        readFileSync(f, "utf8").split("\n").forEach((line, i) => {
          if (BAD_CLASS.test(line)) offenders.push(`${relative(process.cwd(), f).split(sep).join("/")}:${i + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
