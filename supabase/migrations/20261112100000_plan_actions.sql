-- Card 57: keep a plan (reserved), postpone it to next cycle, pay it once, undo a payment, cancel it.

-- 'postponed' = W15 "เลื่อนไปรอบหน้า": holds nothing this cycle, held again in the next one
alter table plans drop constraint plans_status_check;
alter table plans add constraint plans_status_check
  check (status in ('reserved', 'postponed', 'paid', 'cancelled', 'separate'));

-- The category its entry gets when paid (purchases only; a paid bill always goes to 'bills').
-- Null = 'other' at pay time unless the pay request names one.
alter table plans add column category text
  check (category in ('food', 'transport', 'supplies', 'other'));
alter table plans add constraint plans_category_purchase
  check (category is null or kind = 'purchase');

-- Same key twice for one user = the same "เก็บไว้ในแผน" tap: one plan. Setup plans have none.
alter table plans add column idempotency_key text;
alter table plans add constraint plans_user_idempotency_key unique (user_id, idempotency_key);

-- Every state change of a plan, in one transaction with its row locked, so two screens or a
-- double tap cannot both act: pay | unpay | cancel | postpone | keep.
-- Asking for the state the plan is already in changes nothing (same answer twice).
-- PR404: not this user's plan in this cycle · PR409: not allowed from its status (message = status).
create function plan_action(
  p_user uuid, p_cycle uuid, p_plan uuid, p_action text, p_category text, p_today date
)
returns void
language plpgsql
set search_path = public
as $$
declare
  p plans%rowtype;
  new_entry uuid;
begin
  select * into p from plans
  where id = p_plan and user_id = p_user and cycle_id = p_cycle
  for update;
  if not found then
    raise exception 'plan not found' using errcode = 'PR404';
  end if;

  if (p_action = 'pay' and p.status = 'paid')
    or (p_action = 'cancel' and p.status = 'cancelled')
    or (p_action = 'postpone' and p.status = 'postponed')
    or (p_action in ('keep', 'unpay') and p.status = 'reserved') then
    return;
  end if;

  if (p_action in ('pay', 'cancel') and p.status not in ('reserved', 'postponed'))
    or (p_action = 'postpone' and p.status <> 'reserved')
    or (p_action = 'keep' and p.status <> 'postponed')
    or (p_action = 'unpay' and p.status <> 'paid') then
    raise exception '%', p.status using errcode = 'PR409';
  end if;

  if p_action = 'pay' then
    -- The key includes the version, so paying again after an undo is a new spend, never a clash
    insert into entries (user_id, cycle_id, amount, category, note, spent_on, source, idempotency_key)
    values (
      p_user, p_cycle, p.amount,
      case p.kind when 'bill' then 'bills' else coalesce(p_category, p.category, 'other') end,
      p.title, p_today, 'plan', 'plan:' || p.id || ':' || p.version
    )
    returning id into new_entry;
    update plans set status = 'paid', entry_id = new_entry, version = version + 1 where id = p.id;
  elsif p_action = 'unpay' then
    -- Cancelled, never deleted: the payment stays in history
    update entries set cancelled_at = now() where id = p.entry_id;
    update plans set status = 'reserved', entry_id = null, version = version + 1 where id = p.id;
  else
    update plans
    set status = case p_action when 'cancel' then 'cancelled' when 'postpone' then 'postponed' else 'reserved' end,
        version = version + 1
    where id = p.id;
  end if;
end;
$$;

revoke execute on function plan_action(uuid, uuid, uuid, text, text, date) from public, anon, authenticated;
grant execute on function plan_action(uuid, uuid, uuid, text, text, date) to service_role;

-- New cycle: postponed plans come along too, and are held there (W15 "ค่อยดูอีกครั้งตอนเงินเข้า")
create or replace function create_cycle(p_user uuid, p_today date, p_cycle jsonb, p_plans jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  old_id uuid;
  old_payday date;
  new_id uuid;
begin
  -- Lock the active cycle so two setups at once cannot both pass this check
  -- (with no active cycle, the one-active unique index stops the second insert)
  select id, payday into old_id, old_payday
  from cycles
  where user_id = p_user and status = 'active'
  for update;

  if old_id is not null then
    if old_payday > p_today then
      raise exception 'active cycle until %', old_payday using errcode = 'PR409';
    end if;
    update cycles set status = 'closed' where id = old_id;
  end if;

  insert into cycles (
    user_id, start_balance, start_balance_at, payday, emergency_buffer,
    savings_amount, savings_percent, essential_food_daily, essential_transport_daily,
    income_source, income_frequency
  )
  values (
    p_user,
    (p_cycle->>'start_balance')::bigint,
    coalesce((p_cycle->>'start_balance_at')::timestamptz, now()),
    (p_cycle->>'payday')::date,
    coalesce((p_cycle->>'emergency_buffer')::bigint, 0),
    coalesce((p_cycle->>'savings_amount')::bigint, 0),
    (p_cycle->>'savings_percent')::smallint,
    (p_cycle->>'essential_food_daily')::bigint,
    (p_cycle->>'essential_transport_daily')::bigint,
    p_cycle->>'income_source',
    p_cycle->>'income_frequency'
  )
  returning id into new_id;

  if old_id is not null then
    update plans set cycle_id = new_id, status = 'reserved', version = version + 1
    where cycle_id = old_id and status in ('reserved', 'postponed');
  end if;

  insert into plans (user_id, cycle_id, kind, title, amount, due_on, status)
  select p_user, new_id, x.kind, x.title, x.amount, x.due_on, x.status
  from jsonb_to_recordset(p_plans) as x(kind text, title text, amount bigint, due_on date, status text);

  return new_id;
end;
$$;
