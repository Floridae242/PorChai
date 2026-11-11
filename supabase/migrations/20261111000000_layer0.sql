-- Layer 0-1 schema (docs/backend-design.md section 6).
-- RLS is enabled on every table with NO policy: only the service role
-- (server-side API) can read or write. Anon/authenticated see nothing.

create table users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  created_at timestamptz not null default now()
);

create table cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  start_balance bigint not null check (start_balance >= 0),
  payday date not null,
  emergency_buffer bigint not null default 0 check (emergency_buffer >= 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One active cycle per user
create unique index cycles_one_active on cycles (user_id) where status = 'active';

create table entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  cycle_id uuid not null references cycles (id),
  amount bigint not null check (amount > 0),
  category text not null
    check (category in ('food', 'transport', 'supplies', 'fun', 'bills', 'other')),
  note text,
  spent_on date not null,
  source text not null
    check (source in ('chat', 'form', 'plan', 'reminder', 'ocr')),
  -- Same key twice = same spend: blocks double-charging on retries
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entries_user_spent_on on entries (user_id, spent_on);
create index entries_cycle on entries (cycle_id);

create table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  cycle_id uuid not null references cycles (id),
  kind text not null check (kind in ('bill', 'purchase')),
  title text not null,
  amount bigint not null check (amount > 0),
  due_on date,
  status text not null default 'reserved'
    check (status in ('reserved', 'paid', 'cancelled')),
  entry_id uuid references entries (id) on delete set null,
  created_at timestamptz not null default now()
);

create index plans_user on plans (user_id);
create index plans_cycle on plans (cycle_id);

create table category_limits (
  cycle_id uuid not null references cycles (id) on delete cascade,
  category text not null
    check (category in ('food', 'transport', 'supplies', 'fun', 'bills', 'other')),
  amount bigint not null check (amount > 0),
  primary key (cycle_id, category)
);

create table chat_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'discarded')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index chat_drafts_user on chat_drafts (user_id);

-- Dedupe of LINE webhook redeliveries
create table line_events (
  webhook_event_id text primary key,
  received_at timestamptz not null default now()
);

alter table users enable row level security;
alter table cycles enable row level security;
alter table entries enable row level security;
alter table plans enable row level security;
alter table category_limits enable row level security;
alter table chat_drafts enable row level security;
alter table line_events enable row level security;
