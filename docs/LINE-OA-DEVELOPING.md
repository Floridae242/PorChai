# LINE OA: Developing replies

The webhook can reply to a new follow event and text messages with the current
Developing status and an **เปิด MINI App** URI quick reply. It does not parse,
store or confirm financial transactions. The reply never repeats the incoming
message, and no raw event, reply token, ID token or access token is logged.

## Configuration and real test

1. Set `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` from Messaging API
   channel **2012545691** in the server environment. Set
   `NEXT_PUBLIC_LIFF_ID=2012545254-6025ZG1r` for the Developing MINI App.
2. Run the app on a team-approved public HTTPS development endpoint. Set
   Developing MINI App Endpoint URL to `https://<dev-host>/miniapp`.
3. Set Messaging API Webhook URL to `https://<dev-host>/api/line/webhook` and click
   **Verify**. Correctly signed `events: []` returns 200 even without an access
   token or LIFF ID, because verification sends no reply.
4. Enable **Use webhook**. Turn off the OA Manager greeting/automatic responses
   if they would duplicate this Developing bot's replies. This code does not
   modify Console or OA Manager settings.
5. Using a team test account, follow the OA or send a short text. Expect a
   Developing capability notice, an explicit note that the text was not recorded
   as an expense, and the **เปิด MINI App** button. Opening it should reach the
   Developing MINI App's existing LINE identity gate.

The button uses `https://miniapp.line.me/{liffId}`, with the ID from environment.
It must match Developing, not a Review/Published internal channel.

## Failure behavior and boundaries

- Raw-body signature validation precedes JSON parsing and all outbound requests.
  Invalid/missing signature: 401. Invalid payload: 400. Missing webhook secret: 503.
- Replyable events require a valid LIFF ID and server access token; missing
  configuration: 503. Reply API failure/network timeout: a generic 502 without
  upstream data. The request timeout is 5 seconds.
- Unsupported events, malformed events without a usable reply token, and standby
  events are acknowledged without sending. Images are not downloaded or OCR-processed.
- Redelivery can retry a failed reply or a reply blocked by missing configuration.
  Only successful replies are remembered by reply token, with a process-local
  cache capped at 500 tokens for 20 minutes. Concurrent requests for the same token
  share an attempt; failures are removed so they remain retryable. Known successful
  duplicates return 200 without sending again.
- This cache is lost on restart and is not shared across instances. LINE enforces
  single use of reply tokens, so an already-used token cannot send another reply.
  If LINE accepted the reply but the response was lost, a retry may return 502
  because the application cannot prove that earlier success. Token expiry and LINE's
  redelivery schedule can also prevent recovery. There is no durable queue, event
  deduplication store or exactly-once delivery guarantee. Do not use this handler
  for financial writes; those need durable idempotency and ownership checks.
- No rich menu is installed, no proactive push/service messages are sent, and
  there is no actual reminder scheduling, expense recording, OCR, AI, or coupon issuance.

Tests use dummy secrets/tokens and mocked `fetch`; they never send messages to LINE.
Real Console configuration and LINE account tests still need to be performed by
the team once the HTTPS endpoint is available. No deployment was performed.

## Official references

- [Sending reply messages](https://developers.line.biz/en/reference/messaging-api/nojs/#send-reply-message)
- [Webhook redelivery](https://developers.line.biz/en/docs/messaging-api/receiving-messages/#webhook-redelivery)
- [MINI App permanent links](https://developers.line.biz/en/docs/line-mini-app/develop/permanent-links/)
- [Developing internal channel and LIFF ID](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/)
