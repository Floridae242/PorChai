import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Financial/personal data may be written to storage only through the lib/client helpers (which can be
// cleared in one place). Screens and components must never touch localStorage/sessionStorage.
const ROOTS = [join(process.cwd(), "app", "app"), join(process.cwd(), "components")];
const STORAGE = /\b(?:localStorage|sessionStorage)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("no direct browser storage in screens", () => {
  it("app/app and components never reference localStorage or sessionStorage", () => {
    const files = ROOTS.flatMap((r) => walk(r));
    expect(files.length).toBeGreaterThan(30);
    const offenders = files
      .filter((f) => STORAGE.test(codeOnly(readFileSync(f, "utf8"))))
      .map((f) => relative(process.cwd(), f).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });
});
