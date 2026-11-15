import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["scripts/*.bench.ts"], env: loadEnv(mode, process.cwd(), ["SUPABASE_", "SCALE_"]),
    setupFiles: ["./vitest.db.setup.ts"], fileParallelism: false, testTimeout: 120_000,
  },
}));
