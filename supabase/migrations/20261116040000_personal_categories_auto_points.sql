create table spending_categories (
  user_id uuid not null references users(id) on delete cascade,
  id text not null,
  label text not null check(length(trim(label)) between 1 and 30),
  parent text not null check(parent in ('food','transport','supplies','other','bills')),
  monthly_budget bigint check(monthly_budget between 0 and 10000000),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(user_id,id),
  check(id in ('food','transport','supplies','other','bills') or id ~ '^[0-9a-f-]{36}$'),
  check(parent <> 'bills' or id='bills')
);
create unique index spending_categories_label on spending_categories(user_id,lower(trim(label)));
alter table spending_categories enable row level security;
revoke all on spending_categories from public,anon,authenticated;
grant all on spending_categories to service_role;

insert into spending_categories(user_id,id,label,parent)
select u.id,c.id,c.label,c.id from users u cross join (values ('food','อาหาร'),('transport','เดินทาง'),('supplies','ของใช้'),('other','อื่น ๆ'),('bills','บิล')) as c(id,label);
create function seed_spending_categories() returns trigger language plpgsql set search_path=public as $$
begin
  insert into spending_categories(user_id,id,label,parent) select new.id,c.id,c.label,c.id
    from (values ('food','อาหาร'),('transport','เดินทาง'),('supplies','ของใช้'),('other','อื่น ๆ'),('bills','บิล')) as c(id,label);
  return new;
end;
$$;
revoke all on function seed_spending_categories() from public,anon,authenticated;
create trigger users_spending_categories after insert on users for each row execute function seed_spending_categories();

alter table entries add column category_id text;
alter table entries add foreign key(user_id,category_id) references spending_categories(user_id,id);
create index entries_custom_category on entries(user_id,category_id,spent_on) where category_id is not null;
create function check_spending_category() returns trigger language plpgsql set search_path=public as $$
declare group_name text;
begin
  if new.category_id is not null then
    select parent into group_name from spending_categories where user_id=new.user_id and id=new.category_id;
    if not found then raise exception 'category not found' using errcode='SC404'; end if;
    if group_name <> new.category then raise exception 'category group mismatch' using errcode='SC422'; end if;
  end if;
  return new;
end;
$$;
revoke all on function check_spending_category() from public,anon,authenticated;
create trigger entry_spending_category before insert or update of category_id,category,user_id on entries for each row execute function check_spending_category();

create function save_spending_category(p_user uuid,p_id text,p_label text,p_parent text,p_budget bigint,p_version timestamptz) returns spending_categories
language plpgsql set search_path=public as $$
declare row spending_categories; new_id text;
begin
  if p_label is null or length(trim(p_label)) not between 1 and 30 or p_parent is null or p_parent not in ('food','transport','supplies','other','bills')
    or (p_budget is not null and (p_budget < 0 or p_budget > 10000000)) then raise exception 'invalid category' using errcode='SC422'; end if;
  perform 1 from users where id=p_user for update;
  if not found then raise exception 'user not found' using errcode='SC404'; end if;
  if p_id is null then
    if (select count(*) from spending_categories where user_id=p_user)>=100 then raise exception 'category limit' using errcode='SC422'; end if;
    if p_parent='bills' then raise exception 'bill category is system-owned' using errcode='SC422'; end if;
    new_id:=gen_random_uuid()::text;
    insert into spending_categories(user_id,id,label,parent,monthly_budget) values(p_user,new_id,trim(p_label),p_parent,p_budget) returning * into row;
  else
    select * into row from spending_categories where user_id=p_user and id=p_id for update;
    if not found then raise exception 'category not found' using errcode='SC404'; end if;
    if p_version is null or p_version <> row.updated_at then raise exception 'category changed' using errcode='SC409'; end if;
    if row.parent <> p_parent then raise exception 'category group cannot change' using errcode='SC422'; end if;
    update spending_categories set label=trim(p_label),monthly_budget=p_budget,updated_at=clock_timestamp() where user_id=p_user and id=p_id returning * into row;
  end if;
  return row;
exception when unique_violation then raise exception 'duplicate category label' using errcode='SC422';
end;
$$;
revoke all on function save_spending_category(uuid,text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function save_spending_category(uuid,text,text,text,bigint,timestamptz) to service_role;

-- Award once per Thai day, in the same transaction as a confirmed new income/expense.
-- Drafts, edits, backdated records and cancelled inserts do not earn another day of points.
create function auto_record_points() returns trigger language plpgsql set search_path=public as $$
declare day date := (now() at time zone 'Asia/Bangkok')::date; recorded_day date;
begin
  if tg_table_name='entries' then
    if new.cancelled_at is not null then return new; end if;
    recorded_day:=new.spent_on;
  else recorded_day:=new.received_on;
  end if;
  if recorded_day=day then perform claim_daily_points(new.user_id,'auto-record:'||day); end if;
  return new;
end;
$$;
revoke all on function auto_record_points() from public,anon,authenticated;
create trigger entry_auto_points after insert on entries for each row execute function auto_record_points();
create trigger income_auto_points after insert on incomes for each row execute function auto_record_points();

create function spending_insights(p_user uuid,p_today date) returns jsonb language sql stable set search_path=public as $$
with recent as (
  select * from entries where user_id=p_user and cancelled_at is null and spent_on between p_today-29 and p_today
), month_entries as (
  select * from entries where user_id=p_user and cancelled_at is null and spent_on between date_trunc('month',p_today)::date and p_today
), month_totals as (
  select category as id,sum(amount) as spent,count(*) as count from month_entries group by category
  union all
  select category_id as id,sum(amount) as spent,count(*) as count from month_entries where category_id is not null and category_id<>category group by category_id
), categories as (
  select c.id,c.label,c.parent,c.monthly_budget,c.updated_at,
    coalesce(t.spent,0) as spent,coalesce(t.count,0) as count
  from spending_categories c left join month_totals t on t.id=c.id where c.user_id=p_user
), weekdays as (
  select extract(dow from spent_on)::integer as day,sum(amount) as amount,count(*) as count,count(distinct spent_on) as active_days from recent group by 1
), recurring as (
  select trim(note) as label,sum(amount) as amount,count(*) as count,count(distinct spent_on) as days
  from recent where note is not null and length(trim(note))>0 group by trim(note) having count(distinct spent_on)>=3
  order by count(*) desc,trim(note) limit 5
)
select jsonb_build_object(
  'total',coalesce((select sum(amount) from recent),0),'count',(select count(*) from recent),'activeDays',(select count(distinct spent_on) from recent),
  'recentWeek',coalesce((select sum(amount) from recent where spent_on>=p_today-6),0),
  'previousWeek',coalesce((select sum(amount) from recent where spent_on between p_today-13 and p_today-7),0),
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'parent',parent,'monthlyBudget',monthly_budget,'version',updated_at,'spent',spent,'count',count,'remaining',monthly_budget-spent) order by parent,id) from categories),'[]'::jsonb),
  'weekdays',coalesce((select jsonb_agg(jsonb_build_object('day',day,'amount',amount,'count',count,'activeDays',active_days) order by day) from weekdays),'[]'::jsonb),
  'recurring',coalesce((select jsonb_agg(jsonb_build_object('label',left(label,80),'amount',amount,'count',count,'days',days)) from recurring),'[]'::jsonb)
);
$$;
revoke all on function spending_insights(uuid,date) from public,anon,authenticated;
grant execute on function spending_insights(uuid,date) to service_role;
