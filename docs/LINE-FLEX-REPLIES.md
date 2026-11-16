# Flex-first replies — 15 November 2026

PorChai now presents ordinary LINE chat replies as compact Flex Cards: AI wording, greetings, amount/title questions, clarification, price hints, cancellation/status and recoverable errors. Specialized receipts, budget, OCR, reminder and what-if cards keep their existing layout and actions.

`presentReply` is a pure presentation step. The handler stores the original answer in conversation memory before applying it; the reply and push transports also apply it to cover future callers. Applying it twice does not nest cards. It does not call an LLM, infer amounts, write financial records or change a postback's meaning.

## Layout and fallbacks

- Uses the existing Frontend green/lime tokens, wrapped text and a compact brand header. Routine replies do not depend on loading an image.
- The full answer stays in the card body. The notification `altText` uses up to 400 UTF-16 units with grapheme-safe truncation; this is a conservative application limit.
- At most three original actions appear in the card footer. Every original quick reply remains above the keyboard with its exact URI/postback. The existing `เปิดแอป` action is retained without adding a second keyboard copy.
- Empty/whitespace-only messages, bodies over 4,000 UTF-16 units, pathological combining-character clusters, or a generated bubble at/over 28 KiB retain the original text message rather than silently dropping content. These are the exceptions to Flex-first presentation.
- The LINE limits and supported layouts are documented in the [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/#flex-message) and [Flex Message elements](https://developers.line.biz/en/docs/messaging-api/flex-message-elements/). Notifications and device rendering are distinct from the body layout.

## Preview and verification

In development, open `/dev/flex-preview`. Batch C3 includes three synthetic examples: `CHAT-AI`, `CHAT-ASK` and `CHAT-STATUS`; batch C5 shows the real long chat answers (and every guide text) as the wrapper renders them. The preview is disabled in production. It is an approximation of LINE rendering, not a native-device test.

The LINE `POST /v2/bot/message/validate/reply` API accepted all six synthetic payloads (HTTP 200): greeting, AI answer, amount question, clarification, thirteen quick replies and long Thai/emoji text. This validation did not deliver messages to any account and did not change the LINE channel.

Local verification: 19 new presentation tests plus 21 generated preview/limits cases; the full suite passed 1,482 unit/integration tests and 343 PostgreSQL tests. Lint, typecheck, production build, independent review and diff checks passed. Existing tests still check actual postback effects and raw AI conversation memory. No new provider-backed Gemini calls were needed for this presentation-only change.

Changes remain on `Tle`. No commit, push, database migration or deployment was performed in this task. Native LINE rendering on iOS/Android remains a post-deployment check.
