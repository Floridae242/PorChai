# Reports, Notify, Search and campaign mock-ups

Implemented on `Tle`, 15 November 2026. No commit, push, deployment, hosted migration, production notification or live grounded-search request is included in this task.

## Screens

| Route | Behavior |
|---|---|
| `/app` | Adds this month's recorded spending/income overview, report/search/notification links and a clearly labeled synthetic advertisement |
| `/app/reports` | Daily/monthly selection, recorded income/spending/net, interactive day bars, category totals and honest empty/loading/error states |
| `/app/notifications` | Opt-in daily summaries, previous-month summaries and once-daily overspending alerts; all off by default |
| `/app/search` | Private keyword lookup or explicit public web search with source citations |
| `/app/promotions` | Fictional coupons, promotions and sponsored placements, filters and local-only `DEMO-*` codes |

Existing Frontend theme tokens and navigation remain in use. The settings reminder screen links to the new summary settings; habit reminders keep their existing controls. Existing live promo/redeem endpoints are not replaced with fake production offers. Every new mock campaign names fictional merchants and explicitly says it cannot be used to buy real goods. Trying a code does not reserve stock, debit points, contact a shop or send a network request.

## Real report data

`GET /api/reports?period=day|week|month&date=YYYY-MM-DD` requires the verified LINE ID token. Date is optional and defaults to Thai today. Month selects the calendar month containing the date. Week (added 15 November for the chat) selects Monday to Sunday containing the date; days after today are `null`. Invalid/future dates fail with 422. Future days in the current month's chart are `null`, not zero. Past days with no recorded entries are zero.

The server aggregates all matching uncancelled `entries`/`incomes` at one PostgreSQL statement snapshot, including records from closed cycles. Totals are not calculated from capped REST lists. Paid bills are counted once; paid purchases retain their stored category. `source=plan` alone does not mean bill: the existing plan-action transaction already stores category `bills` only for actual bill payments.

Income means recorded income, not the cycle's opening-balance snapshot. Net means recorded income minus recorded expenses; it is not current available balance, actual savings or profit. Amounts are integer satang, checked for JavaScript safe-integer overflow before response. The active-cycle budget remains the existing calculator's responsibility.

Report/private-search SQL reads use a bounded 16-operation pool with a 512-request queue and five-second queue/query deadlines per application process. Periods/results are bounded and the database uses user/date indexes. No new claim of 1,000-user end-to-end production capacity is made.

## LINE Notify

Authenticated preferences:

- `GET /api/notifications/preferences`
- `PUT /api/notifications/preferences` with `{ daily, monthly, budget, time: "20:00" }`

The server ignores client-supplied ownership and validates booleans/time. Preferences are separate from habit reminders. Daily summaries report today's recorded amounts at send time. Monthly summaries run on the first Thai day and summarize the preceding calendar month. Reports send at/after the selected Thai time. Budget alerts run only 08:00–22:00 and only when actual `spentToday` exceeds the calculator's valid daily budget; no daily budget is fabricated when calculation is unavailable. Each alert kind/period is sent at most once through the delivery ledger.

`POST /api/cron/digests` is protected with the existing `CRON_SECRET` bearer credential. Each call processes at most ten opted-in accounts using two workers and returns `{ sent, failed, processed, nextCursor }`. A scheduler/orchestrator **must follow** `?after=<nextCursor>` until `nextCursor` is null; do not schedule only the first page. Monitor `failed` and retry subsequent scheduled runs. This task does not create/enable a hosted scheduler.

Delivery claims use a two-minute owner lease and an immutable UUID as LINE's retry key. Overlapping runs do not independently send the same notification. A failed send can reclaim an expired lease with the original retry key; attempts are capped at three. Opt-in is reread just before pushing; messages require the user to be reachable through the OA. The worker uses deterministic server figures and Flex presentation, not generated monetary advice. There is no advertisement in these notifications. There is no automatic historical catch-up after the eligible day passes.

## Search

`POST /api/search` requires LINE authentication. Body: `{ mode: "entries" | "web", query, period?: "day" | "month" | "year" }`.

Private lookup is literal case-insensitive note matching, not an embedding or general natural-language query engine. It never calls an external LLM or web service. The server derives owner/date bounds, excludes cancelled records and returns complete matching count/total with at most the latest fifty entries. Current month is default; the year option covers the last 366 calendar dates including today. `%`, `_`, quotes and SQL-like input are literal search text. A missing match does not mean no expenses exist.

Web grounding is optional and disabled by default:

```dotenv
GEMINI_WEB_SEARCH_ENABLED=1
GEMINI_SEARCH_MODEL=gemini-3.5-flash-lite
GEMINI_API_KEY=<server-side key>
```

Do not put the key in a `NEXT_PUBLIC_*` variable or a URL. This capability shares the existing provider admission/quota/deadline guards. Only the user's explicit public query is sent; no account ID, spending history, balance or private-search results are attached. No response is accepted unless an actual search tool step, completed text, valid HTTPS citations and provider search suggestions are present. Incomplete/unsupported/provider failures return an explicit unavailable result rather than fabricated search evidence.

The [Google Search grounding guide](https://aistudio.google.com/docs/google-search) specifies the Interactions `google_search` tool, text annotations and search-suggestion HTML. The UI renders inline citation links and isolates provider widgets in sandboxed iframes without scripts or same-origin privileges, with an additional restrictive CSP. Grounding has separate quotas/pricing; check the provider's current [pricing section](https://aistudio.google.com/docs/google-search#pricing) before enabling it. Model/key availability and live provider responses remain deployment checks; no live grounding call was performed here.

In LINE chat, explicit `ค้นเว็บ`, `ค้นหา`, `ค้นรายจ่าย` and `search` commands open the MINI App search screen rather than being parsed as expenses. Grounded web widgets remain in the app, not copied into OA messages.

## Rollout prerequisites

1. Apply `20261116000000_reports_notifications.sql` and `20261116010000_entry_search.sql` to the target database before serving the new APIs. They were applied only to local Supabase. The two unpublished RPC definitions were corrected locally without resetting data, so final local schema matches the migration sources.
2. Keep all earlier required migrations. Never expose the Supabase service-role key to the browser. The new tables/RPCs deny anonymous/authenticated direct database access.
3. Deploy only when authorized, then configure the digest scheduler, paging and secret. Verify with opted-in test accounts and OA friendship before enabling broadly.
4. Enable web grounding only after configuring a supported model/key and reviewing quota/billing. Use synthetic public queries for live validation. The API key exposed in a development tool result during this session should be rotated before enabling this capability; it was not written into the source diff.

## Verification

- 1,518 unit/integration tests passed; 366 local PostgreSQL tests passed.
- Reports tested with 1,105 normal entries plus paid bill/purchase, cancellation, other account and period boundaries; source-plan classification failures were reproduced before correction.
- Tests cover identity failures, malformed input, SQL-like keywords, service-only access, notification opt-in/once-per-day/overlap, stable retries, Thai quiet hours, month boundaries and expired-owner protection.
- Headless local mock-mode browser: four pages HTTP 200 at 390×844 with no horizontal overflow/page errors; interactions verified report day selection, own-entry lookup, saved mock preferences and a synthetic coupon. A 1440px report screenshot was also captured. Browser requests stayed on localhost; no production account, LINE send, provider search or merchant action was used.
- Lint, typecheck, production build, independent review and diff checks passed. No committed visual baseline or native LINE/production scheduling test is claimed.
