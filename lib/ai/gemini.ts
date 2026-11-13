// Gemini (team choice, free tier, key held by Por). Interactions API per the official docs
// (aistudio.google.com/docs/text-generation, /structured-output). Free tier: Google may use what is sent
// to improve its models and people may read it, so callers send the question and computed numbers only —
// never a LINE id, a name or the spending history. Any failure returns null; callers have a fallback.

const URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
// gemini-3.1-flash-lite: eval 13 Nov (npm run eval:chat, 54 messages) answered 36 vs 18 for
// gemini-3.5-flash-lite, which was mostly 503 "high demand"; gemini-2.5-flash-lite is closed to new keys
const MODEL = () => process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
// The user would rather wait than get the template (13 Nov); LINE answered after 13 s in production
const BUDGET_MS = 15_000;
const RETRY_AFTER_MS = 500;

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
  const body = await postWithRetry(URL, {
    model: MODEL(),
    input: opts.input,
    system_instruction: opts.system,
    store: false, // nothing kept server-side for a later turn
    generation_config: { max_output_tokens: opts.maxOutputTokens ?? 400 },
    ...(opts.schema && { response_format: { type: "text", mime_type: "application/json", schema: opts.schema } }),
  });
  return body ? textOf(body as { status?: string; output_text?: string; steps?: Step[] }) : null;
}

// OCR (layer 4): one image and a prompt, JSON out. generateContent, the API's long-standing image input
// (inline_data, base64). The image is sent to Google (free tier, agreed 13 Nov) and kept nowhere here.
export interface ImageOptions {
  prompt: string;
  image: Uint8Array;
  mimeType: string;
  schema: object;
}

export async function generateFromImage(opts: ImageOptions): Promise<string | null> {
  const body = (await postWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
    contents: [
      {
        role: "user",
        parts: [{ text: opts.prompt }, { inline_data: { mime_type: opts.mimeType, data: Buffer.from(opts.image).toString("base64") } }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: opts.schema, maxOutputTokens: 400 },
  })) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  return text || null;
}

// Google busy (503) gets one more try within the same 15 s; any other failure is final (null)
async function postWithRetry(url: string, payload: object): Promise<unknown | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const deadline = Date.now() + BUDGET_MS;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) return null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json", "Api-Revision": "2026-05-20" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(left),
      });
      if (res.status === 503 && attempt === 1) {
        console.error("Gemini 503: busy, trying once more");
        await new Promise((r) => setTimeout(r, RETRY_AFTER_MS));
        continue;
      }
      if (!res.ok) {
        console.error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error(err);
      return null;
    }
  }
  return null;
}

function textOf(body: { status?: string; output_text?: string; steps?: Step[] }): string | null {
  if (body.status && body.status !== "completed") return null;
  if (typeof body.output_text === "string") return body.output_text;
  // The text of the last model output step
  const last = [...(body.steps ?? [])].reverse().find((s) => s.type === "model_output");
  const text = last?.content?.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text).join("");
  return text || null;
}
