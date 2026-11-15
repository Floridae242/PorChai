create index entries_report_live on entries(user_id, spent_on) include(amount, category, source) where cancelled_at is null;
create index incomes_report_live on incomes(user_id, received_on) include(amount) where cancelled_at is null;

create function finance_report(p_user uuid, p_from date, p_until date, p_asof date) returns jsonb
language plpgsql stable set search_path = public as $$
declare result jsonb;
begin
  if p_from is null or p_until is null or p_asof is null or p_until <= p_from or p_until-p_from > 31 then raise exception 'invalid report period'; end if;
  with e as (
    select amount, category, spent_on as day
    from entries where user_id=p_user and spent_on>=p_from and spent_on<p_until and spent_on<=p_asof and cancelled_at is null
  ), i as (
    select amount, received_on as day from incomes where user_id=p_user and received_on>=p_from and received_on<p_until and received_on<=p_asof and cancelled_at is null
  ), d as (
    select day, sum(spent) as spent, sum(income) as income from (
      select day,amount as spent,0::bigint as income from e union all select day,0::bigint,amount from i
    ) rows group by day
  ), c as (select category,sum(amount) as amount,count(*) as count from e group by category)
  select jsonb_build_object('spending',coalesce((select sum(amount) from e),0),
    'income',coalesce((select sum(amount) from i),0),
    'net',coalesce((select sum(amount) from i),0)-coalesce((select sum(amount) from e),0),
    'entriesCount',(select count(*) from e),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by amount desc,category) from c),'[]'::jsonb),
    'days',coalesce((select jsonb_agg(jsonb_build_object('date',day,'spent',spent,'income',income) order by day) from d),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function finance_report(uuid,date,date,date) from public,anon,authenticated;
grant execute on function finance_report(uuid,date,date,date) to service_role;

create table notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  daily boolean not null default false,
  monthly boolean not null default false,
  budget boolean not null default false,
  send_at time not null default '20:00'
);
alter table notification_preferences enable row level security;
revoke all on notification_preferences from public,anon,authenticated;
grant all on notification_preferences to service_role;
create index notification_enabled on notification_preferences(user_id) where daily or monthly or budget;

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check(kind in ('daily','monthly','budget')),
  period text not null check(length(period) between 7 and 10),
  state text not null default 'processing' check(state in ('processing','sent')),
  owner uuid not null,
  lease_until timestamptz not null default now()+interval '120 seconds',
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  unique(user_id,kind,period)
);
alter table notification_deliveries enable row level security;
revoke all on notification_deliveries from public,anon,authenticated;
grant all on notification_deliveries to service_role;
create function claim_notification(p_user uuid,p_kind text,p_period text,p_owner uuid) returns uuid
language plpgsql set search_path = public as $$
declare row notification_deliveries; inserted integer;
begin
  if p_owner is null then raise exception 'missing owner'; end if;
  insert into notification_deliveries(user_id,kind,period,owner) values(p_user,p_kind,p_period,p_owner) on conflict do nothing;
  get diagnostics inserted=row_count;
  select * into row from notification_deliveries where user_id=p_user and kind=p_kind and period=p_period for update;
  if inserted=1 then return row.id; end if;
  if row.state='sent' or row.lease_until>clock_timestamp() or row.attempts>=3 then return null; end if;
  update notification_deliveries set owner=p_owner,lease_until=clock_timestamp()+interval '120 seconds',attempts=attempts+1 where id=row.id;
  return row.id;
end;
$$;
revoke all on function claim_notification(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function claim_notification(uuid,text,text,uuid) to service_role;
