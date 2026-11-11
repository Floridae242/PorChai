// Safety guard: DB tests insert and delete rows, so they must only
// ever run against the local Supabase stack, never a cloud project.
const raw = process.env.SUPABASE_URL;
if (!raw) {
  throw new Error(
    "SUPABASE_URL is not set. Fill .env.test.local from `supabase status -o env` (see README).",
  );
}
let host: string;
try {
  host = new URL(raw).hostname;
} catch {
  throw new Error("SUPABASE_URL is not a valid URL; refusing to run DB tests.");
}
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(
    `Refusing to run DB tests: SUPABASE_URL host "${host}" is not local (127.0.0.1 or localhost).`,
  );
}
