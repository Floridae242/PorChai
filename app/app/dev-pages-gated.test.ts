import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Dev/demo pages must 404 in production.

describe("dev pages are gated in production", () => {
  const root = join(process.cwd(), "app", "app");
  const files = [
    // our Flex preview lives with the other previews under /dev (outside the /app shell)
    join(process.cwd(), "app", "dev", "flex-preview", "page.tsx"),
    join(root, "demo", "ui", "page.tsx"),
    join(root, "promotions", "page.tsx"),
  ];

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
