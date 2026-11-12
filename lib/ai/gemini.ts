// Gemini (team choice, free tier, key held by Por). Interactions API per the official docs
// (aistudio.google.com/docs/text-generation, /structured-output). Free tier: Google may use what is sent
// to improve its models and people may read it, so callers send the question and computed numbers only —
// never a LINE id, a name or the spending history. Any failure returns null; callers have a fallback.

const URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export interface GenerateOptions {
  system: string;
  input: string;
  schema?: object; // JSON output when given
  maxOutputTokens?: number;
}

interface Step {
  type?: string;
  content?: { type?: string; text?: string }[];
}

export async function generate(opts: GenerateOptions): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json", "Api-Revision": "2026-05-20" },
      body: JSON.stringify({
        model: MODEL(),
        input: opts.input,
        system_instruction: opts.system,
        store: false, // nothing kept server-side for a later turn
        generation_config: { max_output_tokens: opts.maxOutputTokens ?? 400 },
        ...(opts.schema && { response_format: { type: "text", mime_type: "application/json", schema: opts.schema } }),
      }),
      signal: AbortSignal.timeout(8000), // the LINE reply token does not wait long
    });
    if (!res.ok) {
      console.error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const body = (await res.json()) as { status?: string; output_text?: string; steps?: Step[] };
    if (body.status && body.status !== "completed") return null;
    if (typeof body.output_text === "string") return body.output_text;
    // The text of the last model output step
    const last = [...(body.steps ?? [])].reverse().find((s) => s.type === "model_output");
    const text = last?.content?.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text).join("");
    return text || null;
  } catch (err) {
    console.error(err);
    return null;
  }
}
