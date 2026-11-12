import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "app", "app");
const EXCLUDED_DIR = join(ROOT, "demo", "ui");
const MOCK_IMPORT =
  /from\s+["'][^"']*lib\/client\/mock(?:-fixtures)?["']|import\(\s*["'][^"']*lib\/client\/mock(?:-fixtures)?["']\s*\)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p !== EXCLUDED_DIR) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

// Screens see data only through useApi(). The one allowed loader is the dev/test api-provider, which
// imports the mock dynamically and is gated by resolveApiMode (production is always live).
const ALLOWED = new Set(["app/app/_providers/api-provider.tsx"]);

// TODO(T4): still imports PROMO_FIXTURES (fake promos). T4 removes the import, then deletes this entry.
const PENDING_T4 = ["app/app/perks/perks-views.tsx"];

describe("no mock code in screens", () => {
  it("no non-test file under app/app imports lib/client/mock or mock-fixtures", () => {
    const offenders = walk(ROOT)
      .filter((f) => MOCK_IMPORT.test(readFileSync(f, "utf8")))
      .map((f) => relative(process.cwd(), f).split(sep).join("/"))
      .filter((f) => !ALLOWED.has(f));
    expect(offenders.filter((f) => !PENDING_T4.includes(f))).toEqual([]);
  });

  it("the pending T4 list has no stale entries (delete an entry once its file is clean)", () => {
    const offenders = walk(ROOT)
      .filter((f) => MOCK_IMPORT.test(readFileSync(f, "utf8")))
      .map((f) => relative(process.cwd(), f).split(sep).join("/"));
    for (const f of PENDING_T4) expect(offenders).toContain(f);
  });
});
