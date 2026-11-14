import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// `npm run eval:chat`: the chat AI against the real Gemini (uses quota). Key from the git-ignored .env.local
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["scripts/**/*.eval.ts"],
    env: loadEnv(mode, process.cwd(), ["GEMINI_", "EVAL_"]),
    testTimeout: 15 * 60_000,
  },
}));
