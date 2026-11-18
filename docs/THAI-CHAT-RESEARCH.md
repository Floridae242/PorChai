# Research-informed Thai chat scenarios

## Sources and limits

- Haruechaiyasak & Kongthon, NECTEC (2013), [LexToPlus](https://aclanthology.org/W13-4702.pdf): examines word-final character repetition and discusses spelling variation, shortened syllables and transliteration in Thai social text. This motivates bounded command-tail cases, not global character deduplication.
- Khampila & Naksen (2022), [LINE conversations across age groups](https://ph02.tci-thaijo.org/index.php/JETA/article/view/246483): describes short successive messages, spelling variation, abbreviations and emoji in a specific teacher/student sample. It does not establish how all Thai people type.
- Horsuwan et al. (2019), [Thai social text language models](https://arxiv.org/abs/1912.01580): emphasizes noisy, domain-specific language and Thai-specific preprocessing. The research is not evidence that PorChai's deployed LLM has been trained or evaluated on these users.

All PorChai utterances in the tests were authored for this project. They are not copied private chats, research participants' messages or frequency-ranked contemporary slang. Specific forms such as “ค้าบบบ” are test-design examples inferred from the linguistic categories above.

## Expected behavior

| Category | PorChai fixture | Required result |
| --- | --- | --- |
| Alternate polite spelling | ดูแต้มคับ | Same read intent |
| Word-final elongation | ดูแต้มค้าบบบ / ดูแต้มค่าาา | Normalize only recognized trailing particles |
| Short successive turns | สร้างบิลค่าน้ำทุกวันที่25ค้าบบบ → 399 → ยืนยันคับ | Keep draft context; save one monthly bill after explicit confirmation |
| Language mixing | ดูแต้ม pls | Accept a bounded, space-separated English courtesy tail |
| Laughter/emoji/acknowledgement | 555 / 👍 / โอเค / ok | Never treat as authorization of a financial draft |
| Questions and negation | ยืนยันป่าว / ยังไม่ยืนยัน | Do not turn into affirmative confirmation |
| Numeric ambiguity | ข้าว 50 555 / เงินเข้า 1 หมื่นมั้ง | Ask for clarification; preserve the ledger |
| Mixed numeric units | เงินเข้า 1 หมื่น / ค่าเช่า 2 พัน | Ask for a full numeric amount; never book 1 or 2 baht |
| Named budgets | ตั้งค่าอาหาร 1 พัน ค่ารถ 20 | Ask for the full food budget; only apply it after a numeric clarification and confirmation |
| Names and repeated digits | ค่าน้ำร้านนนท์ / 555 / 111.11 | Preserve Thai spelling and digits; never globally collapse repetitions |

This is a conservative financial policy: understand a bounded set of command framing variants, preserve the original financial values, and ask when meaning is uncertain. It does not automatically correct arbitrary misspellings, infer all dialects or convert every informal acknowledgement into consent.

The pre-existing `1k` shorthand for a new expense remains 1,000 baht. Settings and pending amount fields require a full numeric value rather than interpreting `1k` or `1m` as 1 baht.

## Verification

`lib/chat/actions/thai-social-typing.test.ts` covers normalization and refusal boundaries. The matching signed-webhook scenarios are in `lib/line/chat.db.test.ts`; they inspect actual rows and balances in a guarded local Supabase instance with LINE delivery and LLM output mocked. No production messages or user records are modified.

Run: `npm test -- lib/chat/actions/thai-social-typing.test.ts`, then `npm run test:db -- lib/line/chat.db.test.ts` with the local test database available. Live LINE rendering, provider-generated language quality and real-user coverage need separate evaluation.
