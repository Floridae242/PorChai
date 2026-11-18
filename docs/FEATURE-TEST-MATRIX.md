# PorChai feature and Thai typing test matrix

Updated: 18 November 2026. This is a map of supported features and test evidence, not a claim that every possible sentence or production integration has been verified.

## How the tests work

- `lib/chat/actions/feature-matrix.test.ts` requires an example for every member of the chat `Tool` union (30 tools). It checks routing and key parsed fields using whitespace, polite/slang endings, Thai digits, fullwidth digits and multiline variants where applicable. Income and expense examples use the ledger parser.
- `typing-scenarios.test.ts` and `thai-social-typing.test.ts` add hand-authored natural language, ambiguity and negative examples. Research context and limits are in `THAI-CHAT-RESEARCH.md`.
- `lib/line/chat.db.test.ts` exercises the signed webhook with a real local database. It checks persisted money, categories, plans and points, including cancel, stale buttons, duplicate confirmation and transitions between intents. LINE replies and the model are mocked.
- API/DB tests exercise authentication, ownership, validation, transactional mutations, retries and notification jobs independently of chat wording.
- Browser presentation tests use local mock data and block external requests. They check UI navigation and session continuity, not real LINE identity or delivery.

## Feature coverage

Every chat tool has typing variants in the routing matrix. Additional behavioral evidence is listed below; paths are relative to the repository.

| User feature / chat tools | Chat example | Additional behavioral evidence |
| --- | --- | --- |
| Help / `help` | ขอวิธีใช้ | `lib/line/chat.db.test.ts`, guide/Flex unit tests, browser M04 |
| Initial setup / `setup` | รบกวนช่วยเริ่มรอบเงินหน่อยคับ | Chat setup dialogue: no invented income or essentials; `app/api/cycle/cycle.db.test.ts`, browser M01 |
| Record income / `income` | ได้รับเงิน 500 บาท | Chat + `app/api/income/income.db.test.ts`; no-cycle, invalid amount and replay checks |
| Record expense / `entry` | ข้าว 50 บาท | Chat + `app/api/entries/entries.db.test.ts`; multi-record drafts, ambiguous/negated text, daily point award; browser M01/M06 |
| Edit/delete expense / `entry_edit`, `entry_delete` | แก้รายการล่าสุด 60 บาท / ลบรายการล่าสุด | Chat ownership, stale confirmation and duplicate writes; entries API tests |
| Entry history / `entries` | ดูรายการคับ | Chat read-only invariants and paging; entries API tests |
| Reports / `report` | ดูรายงานวันนี้ค่ะ! | `lib/db/reports.db.test.ts`, `app/api/reports/route.db.test.ts`; day/month boundaries; browser M01 |
| Behavior analysis / `insights` | วิเคราะห์การใช้เงิน | `lib/db/personal-finance.db.test.ts`, insights component tests, browser M04 |
| Categories / `categories`, `category_save`, `category_entry` | เพิ่มหมวด ชานมเดโม กลุ่ม อาหาร งบ 500 บาท | Chat create/update budget + entry category ID + money/points consistency; `app/api/categories/route.db.test.ts`; browser M05 |
| Plans and bills / `plans`, `add_plan`, `add_bill` | สร้างบิลค่าเน็ต 399 บาททุกวันที่ 25 ของเดือน | Chat missing amount, ambiguous dates, cancellation, replaced drafts, no expense on creation; bills/plans API tests; browser M03 |
| Plan lifecycle / `plan_action` | จ่ายบิล 1 / ยกเลิกการจ่ายบิล 1 / เลื่อนแผน 1 / เก็บแผน 1 / ยกเลิกบิล 1 | Two typing endings per action: preview, cancel, old button, confirm, repeated button; verifies row state and expense amount |
| Installments / `installments` | ผ่อน โทรศัพท์ ยอดรวม 1000.01 บาท 3 งวด เริ่ม YYYY-MM-DD | Chat confirmation + exact 100001-satang total + no purchase-total expense; `lib/db/installments.db.test.ts`; invalid count/date/down-payment/interest ambiguity |
| Points / `points`, `claim_points` | ดูแต้ม / เช็กครบแล้ว | Automatic daily award, manual same-day idempotency, chat/MINI App identity: `lib/line/points-sync.db.test.ts`, `lib/db/points-history.db.test.ts`, browser M01 |
| Rewards / `rewards` | รบกวนช่วยแลกของหน่อยค่าาา | Chat catalog → select → confirm → one stock/point deduction; `lib/db/rewards.db.test.ts`, rewards API tests |
| Coupons/promotions / `promos` | ดูคูปอง | Chat requires fictional sponsor/coupon labels and no expense; browser M04 |
| Notification preferences / `notifications` | เปิดสรุปรายวัน เวลา 21:00 | Chat preview/cancel/confirm + preferences; `lib/remind/digests.db.test.ts`; browser M05 |
| Routine reminder / `reminders` | ตั้งเตือน 21:00 | Chat preference mutations; `lib/remind/reminders.db.test.ts`; settings component tests |
| Bill reminder help / `bill_reminder_help` | ตั้งแจ้งเตือนบิลค่าเน็ต เวลา 09:00 | Chat avoids silently changing digest preferences; `lib/remind/bills.db.test.ts` for due notifications and duplicate delivery guards |
| Actual balance / `balance` | ปรับยอด 2000 บาท | Chat cancel/confirm/replay + resulting balance; cycle API tests |
| Buffer / `buffer` | กันเงินเผื่อ 200 บาท | Chat cancel/confirm/replay + resulting buffer; buffer API and settings component tests |
| Payday / `payday` | ตั้งวันรับเงิน 2026-12-25 | Thai/fullwidth ISO digits; chat confirmation; payday API tests |
| Essential daily spend / `essentials` | ตั้งค่าอาหาร 60 ค่ารถ 20 | Chat confirmation + essentialPerDay; rejects ambiguous/mixed-unit amounts instead of reading 1 from 1พัน |
| Search private entries / `search` | ค้นรายจ่าย ข้าว | `lib/db/entry-search.db.test.ts`, search component tests; browser M07 records then finds the same entry, changes to a missing query and clears old results |
| Search web / `web` | ค้นเว็บ ราคาอาหาร | Chat does not record money in the query; grounding/provider resilience tests; browser M07 explicitly displays mock-search limitation |
| Try before buying (separate calculator flow) | ถ้าซื้อรองเท้า 480 ไหวไหม | Chat calculator/decision cards, `app/api/simulate/simulate.db.test.ts`, browser M02 cancellation without expense |
| Receipt OCR | Send a receipt image | `lib/ocr/ocr.db.test.ts`, OCR/provider unit tests; no real image sent to a paid provider in this run |
| Settings/privacy/delete account | MINI App settings | Settings component tests, `app/api/me/delete.db.test.ts`, deleted-account entry tests; browser M08 cancels destructive confirmation |
| Delivery/auth/security | Signed OA webhook and verified MINI App | `lib/auth.db.test.ts`, webhook/handle-event tests, event lease tests, command-memory tests and API ownership checks |

## Browser scenarios

`tests/presentation/miniapp.spec.ts`:

1. M01 consent → setup → record → automatic points → reports.
2. M02 affordability preview → cancel → no expense.
3. M03 recurring bill calendar → review → save.
4. M04 insights → categories → notifications → sample promotions → help.
5. M05 category budget → notification settings.
6. M06 invalid expense amount and payday-passed state.
7. M07 record → private search → no results → web search mode, clearing old results.
8. M08 settings → privacy → delete confirmation → cancel.

## Run locally

```sh
npm test
npm run test:db
npm run demo:miniapp:ci
npm run typecheck
npm run build
```

DB tests require the local Supabase stack and git-ignored `.env.test.local`. The safety setup refuses remote database hosts. Browser artifacts are in `artifacts/presentation/report/index.html` with screenshots/traces/videos.

## Findings from the expanded run

- Fixed Thai/fullwidth ISO-date detection in `statedDate()` for plans and payday commands. Normalize digits only, preserving Thai names.
- Updated the points-sync test's obsolete literal Flex sentence to assert the current multi-record capability, supported 2–5 range, confirmation action and no-write explanation. Wallet/entry invariants remain asserted.
- The new draft/mutation scenarios verify cancellation and duplicate-button safety for categories, one-off plans/bills, settings and all five plan actions.

## Verified results for this run

| Check | Result |
| --- | --- |
| Unit/component tests | 3,051 passed across 143 files |
| Local API/DB integration | 748 cases: initial full run 747 passed and one obsolete text assertion failed; after updating that assertion, its full 2-case file passed on rerun |
| MINI App browser workflows | 8 passed, screenshots and report generated |
| Typecheck | Passed |
| ESLint for touched test/parser files | Passed without errors or warnings |
| Production build | Passed outside the restricted sandbox; initial sandbox build stalled and was stopped |
| Diff whitespace check | Passed |

No commit, push, merge, deployment or real LINE message was performed in this testing run.

## Production checks still required

Real LINE Desktop/mobile rendering, LIFF login/redirect, live model quality, web-search provider results, notification scheduler credentials/quota/delivery and production account 0/1 point reconciliation are not established by these local tests. No production deployment, real LINE messages or live 1,000-user load test is part of this run.
