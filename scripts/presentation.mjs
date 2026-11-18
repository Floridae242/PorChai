import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

// All commands use fixed local configs. No user-supplied URL or shell command is executed.
const full = process.argv.includes("--full");
const headed = process.argv.includes("--headed");
function run(args, extra = {}) {
  const result = spawnSync("npm", args, { stdio: "inherit", shell: false, env: { ...process.env, ...extra } });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (full) {
  // Never replay a stale transcript after a failed backend run.
  rmSync("artifacts/presentation/chat-transcript.json", { force: true });
  run(["run", "test:db", "--", "tests/presentation/user-workflow.db.test.ts"], { PORCHAI_DEMO_EXPORT: "1" });
}
run(["exec", "--", "playwright", "test", "--config=playwright.presentation.config.ts", ...(full ? [] : ["--project=miniapp"]), ...(headed ? ["--headed"] : [])], { DEMO_PAUSE_MS: process.env.DEMO_PAUSE_MS ?? (headed ? "1200" : "0") });
