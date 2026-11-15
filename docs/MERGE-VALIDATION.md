# Branch integration — 14 November 2026

Integrated branch tips: Frontend `aaa64d8` (already in main `5ce18f1`), Backend `3717570`, QA/Tester `52e3b7c`, and Tle `2e7da73`. Earlier feature/integration branches are included through their existing ancestry.

Frontend (โฟรวิว) is the primary runtime UI and LINE card design. Runtime `lib/chat/messages.ts` matches main's builders; Backend's new handler uses Frontend's cards. Tle's branded preview builders remain isolated in `branded-messages.ts` and `branded-flex.ts`, avoiding the former `flex.ts`/`flex/index.ts` import collision. LINE replies retain a 10-second timeout and sanitized errors.

QA integration repairs:

- Replace nonexistent Prisma/service imports with tests of the real mock client. These prove demo client contracts, not multi-user database locking.
- Enable three quarter-baht assertions now implemented by the calculator.
- Synchronize the dependency lockfile; keep generated office locks and browser traces local.
- Use current `/app` routes and strict assertions in Playwright, with a dedicated local mock server on port 3101. Cover trial calculation, cancellation without spending, duplicate save, expired payday UI, and keeping trial input out of URLs. No real LINE login or production mutation is performed.

Validation:

- `npm ci`: passed after lockfile synchronization.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- `npm test`: 86 files passed; 1,200 tests passed, 2 existing QA TODO cases remain.
- `npm run test:db`: 18 files, 287 tests passed. Applied four new migrations only to local Supabase and refreshed dates only for the three local demo seed accounts; no database reset or hosted migration.
- `npx playwright test`: four cases passed initially; the fifth passed on targeted rerun after correcting its heading selector.

The two QA TODOs and real-device LINE testing remain separate from this merge's automated evidence. No manual deployment or hosted configuration change was performed.
