-- รายรับ (the app's "จด › รายรับ" and the chat's «รับ 500»): money received raises the money on hand.
-- Like entries: cancelled, never deleted; the same key twice for one user is one income; only income
-- logged after the balance anchor counts (lib/calc/inputs.ts balanceNow), so ปรับยอด never counts it twice.
create table incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  cycle_id uuid not null,
  amount bigint not null check (amount > 0),
  note text,
  received_on date not null,
  source text not null check (source in ('chat', 'form')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (user_id, idempotency_key),
  foreign key (cycle_id, user_id) references cycles (id, user_id)
);

create index incomes_cycle on incomes (cycle_id);

revoke all on incomes from anon, authenticated;
alter table incomes enable row level security;
