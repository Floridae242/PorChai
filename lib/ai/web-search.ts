import type { SearchResult } from "@/lib/reports/types";
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function safeSource(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !u.hostname.includes(".") ||
      /^[\d.]+$|:|(?:^|\.)(?:localhost|local|internal)$/i.test(u.hostname)
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function parseGroundedSearch(raw: unknown): SearchResult | null {
  const body = obj(raw),
    steps = list(body.steps);
  if (
    body.status !== "completed" ||
    !steps.some((s) => obj(s).type === "google_search_call")
  )
    return null;
  const sources: SearchResult["sources"] = [],
    citations: NonNullable<SearchResult["citations"]> = [],
    suggestions: string[] = [];
  let answer = "";
  for (const step of steps) {
    const s = obj(step);
    if (s.type === "google_search_result")
      for (const item of list(s.result)) {
        const html = obj(item).search_suggestions;
        if (typeof html === "string" && html.trim()) {
          if (html.length > 16000 || suggestions.length >= 4) return null;
          suggestions.push(html);
        }
      }
    if (s.type !== "model_output") continue;
    for (const part of list(s.content)) {
      const p = obj(part);
      if (p.type !== "text" || typeof p.text !== "string") continue;
      const offset = answer.length + (answer ? 2 : 0);
      answer += (answer ? "\n\n" : "") + p.text;
      if (answer.length > 5000) return null;
      for (const annotation of list(p.annotations)) {
        const a = obj(annotation);
        if (a.type !== "url_citation") continue;
        const url = safeSource(a.url),
          start = a.start_index ?? a.startIndex,
          end = a.end_index ?? a.endIndex;
        if (
          !url ||
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          Number(start) < 0 ||
          Number(end) <= Number(start) ||
          Number(end) > p.text.length
        )
          return null;
        let index = sources.findIndex((source) => source.url === url);
        if (index < 0) {
          if (sources.length >= 10) return null;
          sources.push({
            url,
            title:
              typeof a.title === "string"
                ? a.title.slice(0, 100)
                : new URL(url).hostname,
          });
          index = sources.length - 1;
        }
        citations.push({ end: offset + Number(end), source: index });
      }
    }
  }
  if (!answer.trim() || !sources.length || !suggestions.length) return null;
  return { mode: "web", answer, sources, citations, suggestions };
}
