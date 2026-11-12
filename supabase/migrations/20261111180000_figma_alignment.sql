-- Align layer 0 with the team Figma ("Slides (สำหรับเพื่อน)"), docs/backend-design.md sections 5-6.

-- Cycle setup (W4-W7): where the money comes from, savings and buffer set aside at the start,
-- and the daily essentials that decide how much one item may cost.
alter table cycles
  -- When start_balance was true (W5 "ยอดนี้ ณ ... แก้เวลา"); entries logged after it come off it
  add column start_balance_at timestamptz not null default now(),
  add column income_source text check (income_source in ('family', 'side_job', 'other')),
  -- The day of month / weekday comes from payday itself, so it is not stored twice
  add column income_frequency text check (income_frequency in ('weekly', 'monthly', 'irregular')),
  -- Frozen when the cycle starts; savings_percent only records how the user chose it (null = own amount)
  add column savings_amount bigint not null default 0 check (savings_amount >= 0),
  add column savings_percent smallint check (savings_percent between 1 and 100),
  add column essential_food_daily bigint not null default 0 check (essential_food_daily >= 0),
  add column essential_transport_daily bigint not null default 0 check (essential_transport_daily >= 0),
  -- Bumped on every change, so a screen holding an old copy can be refused (card 23)
  add column version integer not null default 1;

alter table plans
  add column version integer not null default 1,
  -- One entry settles at most one plan: paying twice cannot point two plans at one spend
  add constraint plans_entry_id_key unique (entry_id);

-- 'separate' = a bill paid from other money (W5 "จ่ายแยก (ไม่หัก)"): kept for the record, never reserved
alter table plans drop constraint plans_status_check;
alter table plans add constraint plans_status_check
  check (status in ('reserved', 'paid', 'cancelled', 'separate'));
alter table plans add constraint plans_separate_is_bill
  check (status <> 'separate' or kind = 'bill');

-- Four user categories (Figma). 'bills' stays for the entry a paid bill creates,
-- so rent does not swamp "อื่น ๆ" in the category chart.
alter table entries drop constraint entries_category_check;
alter table entries add constraint entries_category_check
  check (category in ('food', 'transport', 'supplies', 'other', 'bills'));
alter table entries add constraint entries_bills_from_plan
  check (category <> 'bills' or source = 'plan');

alter table category_limits drop constraint category_limits_category_check;
alter table category_limits add constraint category_limits_category_check
  check (category in ('food', 'transport', 'supplies', 'other'));

-- "ปรับยอด": the real balance the user reported and when it was true.
-- The latest one replaces start_balance as the anchor (lib/calc/inputs.ts balanceNow);
-- no running balance is stored, so editing an old entry can never be taken twice.
create table balance_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  cycle_id uuid not null,
  balance bigint not null check (balance >= 0),
  as_of timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (cycle_id, user_id) references cycles (id, user_id) on delete cascade
);

create index balance_checks_cycle on balance_checks (cycle_id, as_of desc);

revoke all on balance_checks from anon, authenticated;
alter table balance_checks enable row level security;
