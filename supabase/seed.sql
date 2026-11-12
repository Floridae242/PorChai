-- Local test data only (loaded by `supabase db reset`; `db push` never sends it to the cloud).
-- Card 05: one demo user per state on the Figma cycle:
--   2,400 on hand · bill 600 unpaid · savings 10% = 240 · buffer 120 · food 50 + transport 20 · payday in 12 days
--   U_demo_try   ลอง        rice 45 today; trying something stores nothing
--   U_demo_plan  เลือกแผน   shoes 480 held back as a plan (money still 2,400)
--   U_demo_paid  จ่ายจริง   shoes 480 paid once (money 1,920, plan points at its entry)
-- Dates follow today in Thai time, so the numbers never go stale.

-- Balance was read an hour ago: entries made now come after it and are taken off it
create temporary table demo_users on commit drop as
with ins as (
  insert into users (line_user_id)
  values ('U_demo_try'), ('U_demo_plan'), ('U_demo_paid')
  returning id, line_user_id
)
select * from ins;

create temporary table demo_cycles on commit drop as
with ins as (
  insert into cycles (
    user_id, start_balance, start_balance_at, payday, emergency_buffer,
    savings_amount, savings_percent, essential_food_daily, essential_transport_daily,
    income_source, income_frequency
  )
  select id, 240000, now() - interval '1 hour',
         (now() at time zone 'Asia/Bangkok')::date + 12, 12000,
         24000, 10, 5000, 2000, 'family', 'monthly'
  from demo_users
  returning id, user_id
)
select c.id, c.user_id, u.line_user_id from ins c join demo_users u on u.id = c.user_id;

-- Every user: dorm bill 600, not paid yet
insert into plans (user_id, cycle_id, kind, title, amount)
select user_id, id, 'bill', 'ค่าหอ', 60000 from demo_cycles;

-- ลอง: rice 45 today
insert into entries (user_id, cycle_id, amount, category, note, spent_on, source, idempotency_key)
select user_id, id, 4500, 'food', 'ข้าว', (now() at time zone 'Asia/Bangkok')::date, 'form', 'seed-rice'
from demo_cycles where line_user_id = 'U_demo_try';

-- เลือกแผน: shoes 480 held back
insert into plans (user_id, cycle_id, kind, title, amount)
select user_id, id, 'purchase', 'รองเท้า', 48000
from demo_cycles where line_user_id = 'U_demo_plan';

-- จ่ายจริง: shoes 480 paid — one entry, the plan points at it
with c as (select * from demo_cycles where line_user_id = 'U_demo_paid'),
e as (
  insert into entries (user_id, cycle_id, amount, category, note, spent_on, source, idempotency_key)
  select user_id, id, 48000, 'supplies', 'รองเท้า', (now() at time zone 'Asia/Bangkok')::date, 'plan', 'seed-shoes'
  from c
  returning id, user_id, cycle_id
)
insert into plans (user_id, cycle_id, kind, title, amount, status, entry_id)
select user_id, cycle_id, 'purchase', 'รองเท้า', 48000, 'paid', id from e;
