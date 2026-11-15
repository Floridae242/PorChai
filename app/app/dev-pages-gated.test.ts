import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Dev/demo pages must 404 in production.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

describe("dev pages are gated in production", () => {
  const root = join(process.cwd(), "app", "app");
  const files = [...walk(join(root, "dev")), join(root, "demo", "ui", "page.tsx")];

  it("finds the dev pages", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it.each(files)("%s calls notFound() in production and keeps instant = false", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toMatch(/import\s*\{\s*notFound\s*\}\s*from\s*"next\/navigation"/);
    expect(src).toMatch(/process\.env\.NODE_ENV\s*===\s*"production"[\s\S]{0,40}notFound\(\)/);
    expect(src).toMatch(/export const instant = false/);
  });
});
