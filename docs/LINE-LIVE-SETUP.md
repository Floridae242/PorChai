# LINE Developing: live setup

## Configuration inspected on 12 November 2026

- Provider: PorChai, `2005796246`.
- MINI App Developing channel: `2012545254`, LIFF ID `2012545254-6025ZG1r`.
- Messaging API channel: `2012545691`, OA basic ID `@919xmahr`.
- Developing Endpoint: `https://uninterrogatively-poignant-zion.ngrok-free.dev/miniapp`.
- Scopes: `openid, profile` (openid was absent before this setup).
- Webhook: `https://uninterrogatively-poignant-zion.ngrok-free.dev/api/line/webhook`.
- Use webhook is enabled. Review and Published endpoints were not changed.
- Existing Messaging credentials were saved only in ignored `.env.local`, mode
  600. No credential was reissued or committed. ngrok request inspection is off.

This is a temporary HTTPS tunnel to a production build on port 3200, not a
permanent deployment. It only works while this machine, server and tunnel run.
The free tunnel can show **Visit Site** before the web app opens.

## Evidence and remaining user test

- `npm run build` passed after moving Tailwind to the documented PostCSS setup.
- Real LINE bot-info request accepted the existing access token (HTTP 200).
- HTTPS `/miniapp` returned 200.
- Signed `events: []` returned 200; a bad signature returned 401.
- Console Verify response: `status: AVAILABLE`, `message: ok.webhook_success`.
- External-browser login reached LINE with the expected channel and
  `openid profile` scopes. The test LINE account was rejected by LINE with
  `User need to have developer role`; the user confirmed it differs from Admin.
  Add that account as Tester and accept the invitation before retrying. Do not
  bypass this check or use the Published internal channel as a workaround.
- The user-selected Tester account accepted the invitation, and Console now
  lists it as Tester. Existing Admin access was preserved. An earlier invitation
  sent before the user's email correction remains unaccepted; the Console UI
  inspected here did not expose a cancellation control for pending invitations.
- Real external-browser LINE login completed, including profile/identifier
  consent. `/api/line/verify` returned 200 and the authenticated home screen
  displayed the verified LINE identity. The runtime was restarted outside the
  restricted sandbox so outbound verification/reply requests can reach LINE.
- The user confirmed receiving the actual OA reply and **เปิด MINI App** button
  after sending a test message. The user then opened that button on mobile and
  confirmed the MINI App showed the connected state and their real display name.
- Authenticated home, example offers/terms, and about navigation were checked in
  the real browser session. Financial recording, OCR, AI, real coupons and points
  remain outside this connection setup and are marked as developing in the UI.

## Run and verify again

```bash
npm run build
npm run start -- --port 3200
# In another terminal:
ngrok http 3200 --inspect=false
# If the tunnel hostname changes, update both Developing Endpoint and webhook.
npm run line:check -- --url https://YOUR-DEVELOPING-HOST --live
```

`line:check` loads `.env.local`. Without `--live` it only checks configuration.
With `--live` it reads bot info and probes the app with empty events; it does not
send chat messages, change Console settings or print secret/token values.
If `NEXT_PUBLIC_LINE_OA_BASIC_ID` is configured, it also checks that the token's
bot basic ID matches the expected OA. Current automated checks: 96 tests, lint,
TypeScript and production build passed.

Use [OA add friend](https://line.me/R/ti/p/%40919xmahr) or
[the Console's QR](https://qr-official.line.me/sid/L/919xmahr.png), then send a
text from LINE. The bot replies with the Developing notice and MINI App button.
Open [Developing MINI App](https://miniapp.line.me/2012545254-6025ZG1r) using an
Admin/Tester LINE account and consent to profile access. The app must show the
server-verified identity before the authenticated home screen appears.

## Previous values for rollback

- Developing Endpoint was `https://developers.line.biz/assets/liff-default-dev.html`.
- Scopes were `profile` only.
- Webhook was `https://porchai.vercel.app/api/line/webhook`; this session did not
  establish that the old host was reachable or belonged to the connected Vercel
  team. Use webhook was already enabled.

See [OA behavior and retry limitations](LINE-OA-DEVELOPING.md) and the
[official channel role guide](https://developers.line.biz/en/docs/line-developers-console/managing-roles/).
