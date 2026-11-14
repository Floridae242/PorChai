# LINE OA: Developing cards and chat

Current card and LIFF setup: [LINE-CARDS.md](LINE-CARDS.md). Canonical MINI App is
`https://porchai.vercel.app/app`; `/miniapp` is the branded introduction/compatibility page.

## Configuration and test

1. Keep Messaging API channel **2012545691** credentials in server environment variables.
   Use Developing MINI App LIFF ID `2012545254-6025ZG1r` and channel **2012545254**.
2. Deploy the corresponding `/app` login/permanent-link code before changing the
   Developing Endpoint to `https://porchai.vercel.app/app`. Do not publish the MINI App
   or change Review/Published settings as part of this Developing test.
3. Messaging webhook is `https://porchai.vercel.app/api/line/webhook`. Console Verify
   sends empty events; a valid signature returns 200 without touching the database.
4. Enable Use webhook and redelivery. Check OA Manager greeting/auto responses so
   they do not duplicate the webhook's cards. This source code does not change those settings.
5. Configure Supabase server credentials for non-empty chat events. Configure the public
   mascot image origin as described in LINE-CARDS.md; PNGs must be publicly accessible.
6. Follow the OA or send `เมนู`. Expect a four-card carousel. Open a card button:
   LINE's native permanent link opens the selected screen relative to `/app`.
7. Set up a money cycle, send `ข้าว 45`, and check the real expense receipt and entry link.
   For over-budget amounts, choose the existing confirm/try postback action before recording.

## Processing and failure boundaries

- Raw-body HMAC verification runs before parsing and processing. Wrong/missing signature
  returns 401; invalid JSON/events returns 400; missing channel secret returns 503.
- Only one-to-one user events enter the chat handler. Unsupported events have no reply.
- `webhookEventId` is deduplicated in Supabase. Financial saves also use the event-derived
  idempotency key. On processing failure, the webhook forgets the marker and returns 500
  so redelivery can retry; successful duplicate delivery does not record again.
- A reply failure after saving does not roll back the expense or trigger financial reprocessing.
  The LINE reply request has a 10-second timeout; errors omit upstream response bodies.
- Receipt edit/delete buttons open LIFF. The backend validates identity and ownership;
  cancel/delete confirmation happens in the app. Old LINE messages do not update when edited.
- Text parsing supports one expense at a time. Multiple amounts are asked back. Income,
  receipt OCR and automatic points awards are not implemented by these cards.
- No raw event, reply token, ID token or access token should appear in logs or card URLs.

All live message testing requires a permitted Tester/Admin account while the channel is Developing.
