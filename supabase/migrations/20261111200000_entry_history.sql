-- Card 11: entries are cancelled, never deleted, and every change to an entry or plan
-- is written to history by trigger, so no code path can skip it.

alter table entries add column cancelled_at timestamptz;

-- Default to the database clock: entries compare their created_at (also DB clock) with it
alter table balance_checks alter column as_of set default now();

create table history (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  subject text not null check (subject in ('entry', 'plan')),
  subject_id uuid not null,
  action text not null check (action in ('create', 'edit', 'cancel', 'status')),
  before jsonb,
  after jsonb not null,
  created_at timestamptz not null default now()
);

create index history_subject on history (subject_id, id);

revoke all on history from anon, authenticated;
alter table history enable row level security;

-- A cancelled entry is final: no edits, no un-cancel. Also keeps updated_at current.
create function entries_before_update() returns trigger
language plpgsql as $$
begin
  if old.cancelled_at is not null then
    raise exception 'entry % is cancelled', old.id using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger entries_before_update
  before update on entries
  for each row execute function entries_before_update();

create function log_history() returns trigger
language plpgsql as $$
declare
  subj text := case tg_table_name when 'entries' then 'entry' else 'plan' end;
  act text;
begin
  -- Nested per table: plpgsql resolves old.<field> at run time, and the other table lacks it
  act := 'edit';
  if tg_op = 'INSERT' then
    act := 'create';
  elsif tg_table_name = 'entries' then
    if old.cancelled_at is null and new.cancelled_at is not null then
      act := 'cancel';
    end if;
  elsif old.status is distinct from new.status then
    act := 'status';
  end if;

  insert into history (user_id, subject, subject_id, action, before, after)
  values (
    new.user_id,
    subj,
    new.id,
    act,
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new)
  );
  return null;
end;
$$;

create trigger entries_history
  after insert or update on entries
  for each row execute function log_history();

create trigger plans_history
  after insert or update on plans
  for each row execute function log_history();
