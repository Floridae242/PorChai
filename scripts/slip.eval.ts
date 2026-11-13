import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readSlip } from "@/lib/ocr/slip";

// OCR against the real Gemini: EVAL_SLIP=<path to a slip image> npm run eval:chat -- scripts/slip.eval.ts
// Uses a fake slip (never a real one: it would send real names and accounts to the free tier).
it("reads a slip", async () => {
  const path = process.env.EVAL_SLIP;
  expect(path, "set EVAL_SLIP to an image path").toBeTruthy();
  for (let i = 1; i <= 3; i++) {
    const started = Date.now();
    const r = await readSlip(readFileSync(path!), path!.endsWith(".png") ? "image/png" : "image/jpeg", "2026-11-13");
    console.log(`try ${i} (${Date.now() - started} ms):`, JSON.stringify(r));
    if (r) return;
  }
});
