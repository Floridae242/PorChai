-- Service-only snapshots avoid PostgREST's row cap and read all amounts at one MVCC snapshot.
-- No cache of money: every call sees current committed state.
create index entries_live_cycle_anchor on entries (cycle_id, created_at, spent_on) include (amount, source) where cancelled_at is null;
create index incomes_live_cycle_anchor on incomes (cycle_id, created_at, received_on) include (amount) where cancelled_at is null;
create index plans_reserved_cycle on plans (cycle_id) where status = 'reserved';
create index reminder_settings_enabled_time on reminder_settings (remind_at, user_id) where enabled;

create function budget_snapshot(p_user uuid, p_today date) returns jsonb
language sql stable set search_path = public as $$
  with c as (
    select id, start_balance, start_balance_at, payday, emergency_buffer, savings_amount,
           essential_food_daily, essential_transport_daily
    from cycles where user_id = p_user and status = 'active'
  ), a as (
    select amount, as_of from (
      select start_balance as amount, start_balance_at as as_of, 0 as priority, start_balance_at as created_at, id from c
      union all
      select balance, as_of, 1, created_at, id from balance_checks where cycle_id = (select id from c)
    ) anchors order by as_of desc, priority, created_at, id limit 1
  ), e as (
    select coalesce(sum(entries.amount) filter (where created_at > a.as_of and spent_on >= (a.as_of at time zone 'Asia/Bangkok')::date),0) as spent,
           coalesce(sum(entries.amount) filter (where spent_on = p_today and source <> 'plan'),0) as spent_today
    from entries cross join a where cycle_id = (select id from c) and cancelled_at is null
  ), i as (
    select coalesce(sum(incomes.amount),0) as received from incomes cross join a
    where cycle_id = (select id from c) and cancelled_at is null
      and created_at > a.as_of and received_on >= (a.as_of at time zone 'Asia/Bangkok')::date
  ), p as (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'kind', kind, 'amount', amount, 'status', status, 'due_on', due_on) order by created_at, id), '[]'::jsonb) as plans
    from plans where cycle_id = (select id from c) and status = 'reserved'
  )
  select jsonb_build_object('cycle', to_jsonb(c), 'anchor', jsonb_build_object('amount', a.amount, 'asOf', a.as_of),
         'balance', a.amount - e.spent + i.received, 'spentToday', e.spent_today, 'plans', p.plans)
  from c cross join a cross join e cross join i cross join p;
$$;
revoke all on function budget_snapshot(uuid,date) from public, anon, authenticated;
grant execute on function budget_snapshot(uuid,date) to service_role;

-- Fixed-minute admission across serverless instances; no prompts or identities sent to the model.
create table ai_rate_windows (
  scope text primary key,
  window_start timestamptz not null,
  used integer not null default 0 check (used >= 0)
);
alter table ai_rate_windows enable row level security;
revoke all on ai_rate_windows from anon, authenticated;
grant select, insert, update, delete on ai_rate_windows to service_role;
create index ai_rate_windows_expiry on ai_rate_windows(window_start);
create function consume_ai_quota(p_user uuid, p_global_limit integer, p_user_limit integer) returns boolean
language plpgsql set search_path = public as $$
declare
  bucket timestamptz := date_trunc('minute', now());
  g ai_rate_windows;
  u ai_rate_windows;
begin
  if p_user is null or p_global_limit is null or p_user_limit is null or p_global_limit < 1 or p_user_limit < 1 or not exists(select 1 from users where id = p_user) then return false; end if;
  -- All callers lock global then user, avoiding lock-order deadlocks. Rejected work consumes neither.
  insert into ai_rate_windows(scope,window_start) values ('global',bucket) on conflict do nothing;
  select * into g from ai_rate_windows where scope = 'global' for update;
  insert into ai_rate_windows(scope,window_start) values ('user:' || p_user,bucket) on conflict do nothing;
  select * into u from ai_rate_windows where scope = 'user:' || p_user for update;
  bucket := date_trunc('minute', clock_timestamp());
  if (g.window_start = bucket and g.used >= p_global_limit) or (u.window_start = bucket and u.used >= p_user_limit) then return false; end if;
  update ai_rate_windows set used = case when window_start = bucket then used + 1 else 1 end, window_start = bucket
  where scope in ('global','user:' || p_user);
  return true;
end;
$$;
revoke all on function consume_ai_quota(uuid,integer,integer) from public, anon, authenticated;
grant execute on function consume_ai_quota(uuid,integer,integer) to service_role;

-- Previously every insert deleted expired rows for ALL users, causing write amplification.
-- Keep the user's 10-line bound on writes; indexed global expiry runs on the existing 15-minute cron.
create or replace function chat_messages_forget() returns trigger
language plpgsql set search_path = public as $$
begin
  delete from chat_messages where user_id = new.user_id and
    (created_at < now() - interval '30 minutes' or id not in
      (select id from chat_messages where user_id = new.user_id order by id desc limit 10));
  return null;
end;
$$;
-- No cron HTTP call is introduced. Both cleanup functions run locally without any external URL.
create function cleanup_runtime_windows() returns void language plpgsql set search_path = public as $$
begin
  delete from ai_rate_windows where window_start < now() - interval '1 hour';
  delete from chat_messages where created_at < now() - interval '30 minutes';
end;
$$;
revoke all on function cleanup_runtime_windows() from public, anon, authenticated;
grant execute on function cleanup_runtime_windows() to service_role;
select cron.schedule('porchai-ai-window-cleanup', '7 * * * *', 'select public.cleanup_runtime_windows()');
