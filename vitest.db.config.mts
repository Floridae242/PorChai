import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// DB tests read their env from the git-ignored .env.test.local
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["**/*.db.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Only SUPABASE_* vars; setup file refuses non-local URLs
    env: loadEnv(mode, process.cwd(), ["SUPABASE_"]),
    setupFiles: ["./vitest.db.setup.ts"],
    // All files share one database
    fileParallelism: false,
  },
}));
