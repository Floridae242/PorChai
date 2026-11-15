-- A recorded ID was previously considered done before processing started: a process crash lost it.
-- Existing IDs are already completed; new claims carry an owner and a recoverable lease.
alter table line_events add column state text not null default 'done' check (state in ('processing','done')),
  add column lease_token uuid, add column lease_until timestamptz;
create index line_events_pending_lease on line_events(lease_until) where state = 'processing';

create function claim_line_event(p_id text, p_owner uuid) returns text
language plpgsql set search_path = public as $$
declare r line_events; inserted integer;
begin
  if p_owner is null or p_id is null or length(p_id) < 1 or length(p_id) > 200 then raise exception 'invalid event claim'; end if;
  insert into line_events(webhook_event_id,state,lease_token,lease_until)
  values(p_id,'processing',p_owner,clock_timestamp()+interval '120 seconds') on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then return 'claimed'; end if;
  select * into r from line_events where webhook_event_id = p_id for update;
  if not found then return 'busy'; end if;
  if r.state = 'done' then return 'done'; end if;
  if r.lease_until > clock_timestamp() then return 'busy'; end if;
  update line_events set lease_token=p_owner, lease_until=clock_timestamp()+interval '120 seconds' where webhook_event_id=p_id;
  return 'claimed';
end;
$$;
revoke all on function claim_line_event(text,uuid) from public, anon, authenticated;
grant execute on function claim_line_event(text,uuid) to service_role;
