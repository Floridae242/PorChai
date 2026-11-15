# Adaptive conversation regressions — 15 November 2026

The model continues to use the configured Gemini model; no model weights were trained and no new provider was introduced. The change improves prompt instructions, context handling and the boundary between conversation and financial writes. The app keeps the existing Frontend screens and LINE cards.

## Behavior

- Respond to the latest question, including Thai/English mixtures, short requests, financial worries and requests for shorter answers or options. Avoid repeated introductions.
- Use the last six bounded chat lines as conversational context, while current server facts remain authoritative for financial figures. A number outside the context actually sent to the model is no longer allowed through the numeric guard.
- A correction, cancellation, transfer/refund, shared expense, non-money number, future statement or explicit reference to an earlier item must not be silently parsed as a payment. These messages reach conversational AI with a safe clarification fallback when the provider is unavailable.
- Resolve an explicit reference to an item from recent user messages only to a clarification. Do not infer that the user paid. Greetings and thanks clear the preceding pending amount instead of becoming an expense title.
- Reject premature suggestions to record unpaid/unclear purchases, and ask about transfer direction before choosing income versus expense. Reject suggestions to reduce unspecified other budgets.
- Preserve direct entry (`ข้าว 45`), confirmed pending amounts, multi-item confirmation, and explicit what-if cards (`พรุ่งนี้กินชาบู 300 ไหวไหม`).

## Regression evidence

New tests cover model outputs and the signed webhook with actual local PostgreSQL. The initial database run exposed 12 failures, including `ไม่ได้จ่ายข้าว 45`, `โอนให้เพื่อน 100`, and `45 → ขอบคุณ`. Additional red tests captured stale-context numbers, app-topic outputs mislabeled as spending, implicit references, and premature recording suggestions found in real model answers.

The local tests mock external LINE/Gemini calls. They prove routing, persistence and output validation behavior, not the model's general language ability.

Final local verification: 77 added cases (57 unit/integration and 20 PostgreSQL), bringing the totals to 1,442 passing unit/integration tests and 343 passing DB tests. Lint, typecheck, production build, independent code review and `git diff --check` passed. Work remains on `Tle`; no commit, push or deployment is part of this follow-up.

## Small provider-backed sample

Run `npm run eval:chat -- scripts/adaptive.eval.ts` with the server key in ignored `.env.local`. It sends only 12 fixed synthetic examples and synthetic budget facts. Reports are ignored under `scripts/adaptive-eval-*.json`. `EVAL_RUN=baseline` selects the baseline report filename; default writes the candidate. Do not use real account histories or tokens as fixtures.

The fixed automated routing/grounding criteria gave these observed results on `gemini-3.1-flash-lite`:

| Run | Accepted / 12 | No provider answer |
|---|---:|---:|
| Original prompt/guards | 7 | 0 |
| First candidate | 11 | 1 |
| Revised candidate | 11 | 1 |

The revised candidate's timeout was the homework/off-topic case; its financial-worry response succeeded. The first candidate timed out on financial worries. Both live candidate runs therefore **failed** the harness's all-cases assertion; they are not reported as green tests. Output acceptance alone is a narrow metric: manual inspection found premature recording suggestions and overly certain refund advice even in accepted replies. These became additional regression tests and clarification guards. The last guard expansion was verified with the captured reply and local suites, without another provider request.

This is a small before/after sample, not a statistical benchmark or a claim that the LLM now handles every scenario. Provider timing remains variable. More languages, long conversations and unseen wording can still need clarification; the keyword boundaries are conservative and not exhaustive. New failure examples should be added before widening the set of messages that can write financial data.
