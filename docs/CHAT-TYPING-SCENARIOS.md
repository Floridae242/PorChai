# Chat typing regression scenarios

These scenarios use fictional accounts, the signed webhook, local Supabase, and mocked LINE/LLM delivery. They do not send customer messages or certify live LLM answers.

| Scenario | Example input | Expected behavior |
| --- | --- | --- |
| Polite framing | รบกวนช่วยดูรายงานวันนี้หน่อยนะคะ | Opens the daily report without recording an expense |
| Thai digits | สร้างบิลเน็ต ๓๙๙ บาท ทุกวันที่ ๒๕ ของเดือนค่ะ | Previews a 399-baht monthly bill due on day 25 |
| Fullwidth digits | สร้างบิลเน็ต ３９９ บาท ทุกวันที่ ２５ ของเดือน | Same title, amount and due day |
| Missing amount | สร้างบิลเน็ตทุกวันที่ 25 ของเดือน | Asks for money; day 25 is never spent |
| Polite confirmation | ยืนยันค่ะ / ยืนยันครับ! / ตกลงนะคะ | Applies only the current server-owned pending command |
| Polite cancellation | ยกเลิกค่ะ! / ไม่เอาครับ / ไม่ยืนยันนะคะ | Closes the draft; its old button cannot create a bill |
| Question or negation | ยืนยันได้ไหม / ยังไม่ยืนยันครับ / อย่ายืนยันนะคะ | Does not create a bill or spend money |
| Alternative dates | สร้างบิลเน็ต399บาททุกวันที่25หรือ26 | Asks for one unambiguous date; no confirmation offered |
| Conflicting start | สร้างบิลเน็ต399บาททุกวันที่25เริ่ม2026-12-28 | Asks for clarification; does not silently change the recurring day |
| Today versus due day | สร้างบิลเน็ต 399 บาท วันนี้ ทุกวันที่ 25 ของเดือน | Uses day 25 as the recurring due day |
| Old card | Draft 399 → read points → replacement 499 → tap old confirmation | Rejects the old draft and retains the current conversation |
| Lost response | Retry after the schedule commits but its response fails | Returns the same schedule without a duplicate or an expense |
| Whole journey | Income → batch expenses → edit → cancelled delete → delete → points/report | Ledger, balance, cancellation and daily points remain consistent |

Bill input also supports line breaks:

```text
สร้างบิลเน็ต
399 บาท
ทุกวันที่ 25 ของเดือน
```

Tests: `lib/chat/actions/typing-scenarios.test.ts`, `lib/chat/actions/parse.test.ts`, and `lib/line/chat.db.test.ts`. Calendar boundaries cover days 28–31 across ordinary and leap years. Parser variations also cover reports, search, entries, plans, points, rewards, promotions, categories, insights, notifications, reminders, edit/delete, bill payment and buffer commands.

Run offline parser tests with `npm test -- lib/chat/actions/typing-scenarios.test.ts lib/chat/actions/parse.test.ts`. Local database tests require the guarded local Supabase setup: `npm run test:db -- lib/line/chat.db.test.ts lib/line/chat-flow.db.test.ts lib/remind/bills.db.test.ts lib/db/chat-memory.db.test.ts`.
