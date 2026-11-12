-- POST /api/cycle (W4–W9 setup) in one transaction: the cycle and its bills / items are
-- created together or not at all. supabase-js has no transactions, so the server calls this via rpc.
--
-- An active cycle that has not reached payday blocks a new one (PR409). Once payday has come,
-- it is closed and its still-reserved plans move to the new cycle.

create function create_cycle(p_user uuid, p_today date, p_cycle jsonb, p_plans jsonb)
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
    update plans set cycle_id = new_id where cycle_id = old_id and status = 'reserved';
  end if;

  insert into plans (user_id, cycle_id, kind, title, amount, due_on, status)
  select p_user, new_id, x.kind, x.title, x.amount, x.due_on, x.status
  from jsonb_to_recordset(p_plans) as x(kind text, title text, amount bigint, due_on date, status text);

  return new_id;
end;
$$;

-- Functions are executable by PUBLIC by default; this one takes any user id, so only the server may call it
revoke execute on function create_cycle(uuid, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function create_cycle(uuid, date, jsonb, jsonb) to service_role;
