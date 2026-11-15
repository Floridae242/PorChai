-- Schedules are owned by the account; actual obligations remain normal plans and never expenses.
create table bill_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 80),
  amount bigint not null check(amount between 1 and 10000000),
  starts_on date not null,
  repeat text not null check(repeat in ('once','monthly')),
  notify boolean not null default false,
  enabled boolean not null default true,
  idempotency_key text not null check(length(idempotency_key) between 1 and 100),
  unique(id,user_id), unique(user_id,idempotency_key)
);
alter table bill_schedules enable row level security;
revoke all on bill_schedules from public,anon,authenticated;
grant all on bill_schedules to service_role;
alter table plans add column bill_schedule_id uuid;
alter table plans add foreign key(bill_schedule_id,user_id) references bill_schedules(id,user_id);
create unique index plans_bill_occurrence on plans(user_id,bill_schedule_id,due_on) where bill_schedule_id is not null;
create index bill_schedules_enabled on bill_schedules(user_id) where enabled;
create index bill_due_notifications on plans(user_id,due_on) where bill_schedule_id is not null and status='reserved';

-- Clamp a 29/30/31 anchor to the month end, retaining the original anchor next month.
create function bill_month_due(p_month date,p_day integer) returns date language sql immutable as $$
 select (date_trunc('month',p_month)::date + (least(p_day,extract(day from (date_trunc('month',p_month)+interval '1 month -1 day'))::integer)-1))::date;
$$;
create function sync_bill_schedules(p_user uuid,p_today date) returns uuid
language plpgsql set search_path=public as $$
declare c cycles; s bill_schedules; m date; d date; horizon date;
begin
 select * into c from cycles where user_id=p_user and status='active' for update;
 if not found then return null; end if;
 if not exists(select 1 from bill_schedules where user_id=p_user and enabled) then return c.id; end if;
 -- Reserve every occurrence through payday, at least through next month. Bounded by API's cycle horizon.
 horizon := greatest(date_trunc('month',c.payday)::date,(date_trunc('month',p_today)+interval '1 month')::date);
 if horizon > (date_trunc('month',p_today)+interval '13 months')::date then raise exception 'bill horizon too large'; end if;
 for s in select * from bill_schedules where user_id=p_user and enabled order by id loop
   insert into plans(user_id,cycle_id,kind,title,amount,due_on,status,idempotency_key,bill_schedule_id)
   values(p_user,c.id,'bill',s.title,s.amount,s.starts_on,'reserved','bill:'||s.id||':'||s.starts_on,s.id)
   on conflict do nothing;
   if s.repeat='monthly' then
     for m in select generate_series(greatest(date_trunc('month',s.starts_on),date_trunc('month',p_today)),horizon,interval '1 month')::date loop
       d := bill_month_due(m,extract(day from s.starts_on)::integer);
       if d < s.starts_on then continue; end if;
       insert into plans(user_id,cycle_id,kind,title,amount,due_on,status,idempotency_key,bill_schedule_id)
       values(p_user,c.id,'bill',s.title,s.amount,d,'reserved','bill:'||s.id||':'||d,s.id)
       on conflict do nothing;
     end loop;
   end if;
 end loop;
 return c.id;
end;
$$;
-- Financial recurrence is independent of LINE opt-in, scheduler and notification kill switch.
create function sync_bills_after_cycle_change() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.status='active' then
   perform sync_bill_schedules(new.user_id,(clock_timestamp() at time zone 'Asia/Bangkok')::date);
 end if;
 return new;
end;
$$;
create trigger bill_cycle_insert after insert on cycles for each row execute function sync_bills_after_cycle_change();
create trigger bill_cycle_update after update of payday,status on cycles for each row when (new.status='active') execute function sync_bills_after_cycle_change();
revoke all on function sync_bills_after_cycle_change() from public,anon,authenticated;
grant execute on function sync_bills_after_cycle_change() to service_role;
create function create_bill_schedule(p_user uuid,p_title text,p_amount bigint,p_start date,p_repeat text,p_notify boolean,p_key text,p_today date) returns jsonb
language plpgsql set search_path=public as $$
declare s bill_schedules; c uuid;
begin
 select id into c from cycles where user_id=p_user and status='active' for update;
 if not found then raise sqlstate 'BL409' using message='no_cycle'; end if;
 select * into s from bill_schedules where user_id=p_user and idempotency_key=p_key;
 if found then return to_jsonb(s); end if;
 if p_title is null or length(trim(p_title)) not between 1 and 80 or p_amount is null or p_amount not between 1 and 10000000 or p_start is null or p_start < p_today or p_start > p_today+366 or p_repeat is null or p_repeat not in ('once','monthly') or p_notify is null or p_key is null or length(p_key) not between 1 and 100 then raise sqlstate 'BL422' using message='invalid_input'; end if;
 if (select count(*) from bill_schedules where user_id=p_user and enabled)>=50 then raise sqlstate 'BL422' using message='bill_limit'; end if;
 insert into bill_schedules(user_id,title,amount,starts_on,repeat,notify,idempotency_key)
 values(p_user,trim(p_title),p_amount,p_start,p_repeat,p_notify,p_key) returning * into s;
 perform sync_bill_schedules(p_user,p_today);
 return to_jsonb(s);
end;
$$;
create function update_bill_schedule(p_user uuid,p_id uuid,p_notify boolean,p_stop boolean,p_today date) returns jsonb
language plpgsql set search_path=public as $$
declare s bill_schedules;
begin
 perform 1 from cycles where user_id=p_user and status='active' for update;
 select * into s from bill_schedules where id=p_id and user_id=p_user for update;
 if not found then raise sqlstate 'BL404' using message='not_found'; end if;
 update bill_schedules set notify=coalesce(p_notify,notify),enabled=case when p_stop then false else enabled end where id=s.id returning * into s;
 if p_stop then
   update plans set status='cancelled' where user_id=p_user and bill_schedule_id=s.id and due_on>=p_today and status in ('reserved','postponed');
 end if;
 return to_jsonb(s);
end;
$$;

create table bill_deliveries (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
 plan_id uuid not null references plans(id) on delete cascade, lead_days integer not null check(lead_days in (0,3)),
 state text not null default 'processing' check(state in ('processing','sent')),
 owner uuid not null, lease_until timestamptz not null default now()+interval '120 seconds', attempts integer not null default 1,
 unique(plan_id,lead_days)
);
alter table bill_deliveries enable row level security;
revoke all on bill_deliveries from public,anon,authenticated;
grant all on bill_deliveries to service_role;
create function claim_bill_notification(p_user uuid,p_plan uuid,p_lead integer,p_today date,p_owner uuid) returns uuid
language plpgsql set search_path=public as $$
declare r bill_deliveries; inserted integer;
begin
 if p_owner is null then raise exception 'missing owner'; end if;
 if not exists(select 1 from plans p join bill_schedules s on s.id=p.bill_schedule_id and s.user_id=p.user_id join cycles c on c.id=p.cycle_id where p.id=p_plan and p.user_id=p_user and p.status='reserved' and c.status='active' and s.enabled and s.notify and p.due_on=p_today+p_lead) then return null; end if;
 insert into bill_deliveries(user_id,plan_id,lead_days,owner) values(p_user,p_plan,p_lead,p_owner) on conflict do nothing;
 get diagnostics inserted=row_count;
 select * into r from bill_deliveries where plan_id=p_plan and lead_days=p_lead for update;
 if inserted=1 then return r.id; end if;
 if r.state='sent' or r.lease_until>clock_timestamp() or r.attempts>=3 then return null; end if;
 update bill_deliveries set owner=p_owner,lease_until=clock_timestamp()+interval '120 seconds',attempts=attempts+1 where id=r.id;
 return r.id;
end;
$$;
create function due_bill_notifications(p_user uuid,p_today date) returns table(id uuid,title text,amount bigint,due_on date,bill_schedule_id uuid)
language sql stable set search_path=public as $$
 select p.id,p.title,p.amount,p.due_on,p.bill_schedule_id from plans p
 join bill_schedules s on s.id=p.bill_schedule_id and s.user_id=p.user_id
 join cycles c on c.id=p.cycle_id and c.user_id=p.user_id
 where p.user_id=p_user and c.status='active' and p.status='reserved' and s.enabled and s.notify
 and p.due_on in (p_today,p_today+3)
 and not exists(select 1 from bill_deliveries d where d.plan_id=p.id and d.lead_days=p.due_on-p_today and (d.state='sent' or d.attempts>=3 or d.lease_until>clock_timestamp()))
 order by p.id limit 100;
$$;
revoke all on function due_bill_notifications(uuid,date) from public,anon,authenticated;
grant execute on function due_bill_notifications(uuid,date) to service_role;
create function bill_notification_accounts(p_after uuid default null) returns table(user_id uuid)
language sql stable set search_path=public as $$
 select distinct s.user_id from bill_schedules s where s.enabled and (p_after is null or s.user_id>p_after) order by s.user_id limit 10;
$$;
revoke all on function bill_month_due(date,integer),sync_bill_schedules(uuid,date),create_bill_schedule(uuid,text,bigint,date,text,boolean,text,date),update_bill_schedule(uuid,uuid,boolean,boolean,date),claim_bill_notification(uuid,uuid,integer,date,uuid),bill_notification_accounts(uuid) from public,anon,authenticated;
grant execute on function bill_month_due(date,integer),sync_bill_schedules(uuid,date),create_bill_schedule(uuid,text,bigint,date,text,boolean,text,date),update_bill_schedule(uuid,uuid,boolean,boolean,date),claim_bill_notification(uuid,uuid,integer,date,uuid),bill_notification_accounts(uuid) to service_role;
