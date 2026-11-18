-- Cancel the reviewed snapshot atomically. New entries after the preview are never included.
create function cancel_chat_entries(p_user uuid, p_cycle uuid, p_day date, p_items jsonb)
returns integer language plpgsql set search_path = public as $$
declare n integer; active_id uuid; cancelled integer;
begin
  if p_user is null or p_cycle is null or p_day is null or p_items is null
    or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid cancellation snapshot' using errcode='CE422';
  end if;
  n := jsonb_array_length(p_items);
  if n not between 1 and 100 then raise exception 'invalid cancellation count' using errcode='CE422'; end if;
  select id into active_id from cycles where user_id=p_user and status='active' for update;
  if active_id is distinct from p_cycle then raise exception 'cycle changed' using errcode='CE409'; end if;
  perform e.id from entries e
    where e.user_id=p_user and e.id in (select x.id from jsonb_to_recordset(p_items) as x(id uuid))
    order by e.id for update;
  if (select count(*) from entries e where e.user_id=p_user and e.cycle_id=p_cycle and e.spent_on=p_day
      and e.source <> 'plan' and e.id in (select x.id from jsonb_to_recordset(p_items) as x(id uuid))) <> n then
    raise exception 'entry selection changed' using errcode='CE409';
  end if;
  select count(*) into cancelled from entries e where e.user_id=p_user
    and e.id in (select x.id from jsonb_to_recordset(p_items) as x(id uuid)) and e.cancelled_at is not null;
  -- A retry after a lost response reaches the same final state without updating cancelled rows.
  if cancelled=n then return n; end if;
  if cancelled>0 or exists (
    select 1 from entries e join jsonb_to_recordset(p_items) as x(id uuid, "updatedAt" timestamptz) on x.id=e.id
    where e.user_id=p_user and e.updated_at is distinct from x."updatedAt"
  ) then raise exception 'entry snapshot changed' using errcode='CE409'; end if;
  update entries set cancelled_at=now()
    where user_id=p_user and id in (select x.id from jsonb_to_recordset(p_items) as x(id uuid));
  return n;
end;
$$;
revoke all on function cancel_chat_entries(uuid,uuid,date,jsonb) from public,anon,authenticated;
grant execute on function cancel_chat_entries(uuid,uuid,date,jsonb) to service_role;
