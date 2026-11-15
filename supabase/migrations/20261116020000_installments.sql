-- Monthly installments are ordinary bill plans: reserved future rows move with create_cycle.
-- One transaction and one cycle lock prevent partial schedules and concurrent duplicate batches.
create function add_installments(p_user uuid, p_cycle uuid, p_title text, p_total bigint, p_count integer, p_first date, p_key text)
returns void language plpgsql set search_path = public as $$
declare
  active_id uuid;
  i integer;
  due date;
  month_start date;
  amount_due bigint;
  label text;
  existing_count integer;
  existing plans%rowtype;
begin
  if p_user is null or p_cycle is null or p_title is null or length(trim(p_title)) not between 1 and 40
    or p_total is null or p_total not between 1 and 10000000 or p_count is null or p_count not between 1 and 60
    or p_total < p_count or p_first is null or p_first > date '2090-12-31'
    or p_key is null or p_key !~ '^[a-zA-Z0-9:-]{1,100}$' then
    raise exception 'invalid installment' using errcode = 'IN422';
  end if;
  select id into active_id from cycles where user_id=p_user and status='active' for update;
  if active_id is null or active_id <> p_cycle then raise exception 'cycle changed' using errcode='IN409'; end if;
  select count(*) into existing_count from plans where user_id=p_user and idempotency_key=any(
    array(select 'installment:' || p_key || ':' || generate_series(1,p_count)::text));
  -- Also detect reusing a shorter schedule's key for a longer/shorter schedule.
  if exists(select 1 from plans where user_id=p_user and idempotency_key='installment:'||p_key||':1') then
    if existing_count <> p_count then raise exception 'key conflict' using errcode='IN409'; end if;
    for i in 1..p_count loop
      month_start := (date_trunc('month',p_first) + make_interval(months => i-1))::date;
      due := month_start + (least(extract(day from p_first)::integer,extract(day from month_start + interval '1 month - 1 day')::integer)-1);
      amount_due := p_total/p_count + case when i <= p_total%p_count then 1 else 0 end;
      label := trim(p_title)||' · งวด '||i||'/'||p_count;
      select * into existing from plans where user_id=p_user and idempotency_key='installment:'||p_key||':'||i;
      if existing.kind <> 'bill' or existing.title <> label or existing.amount <> amount_due or existing.due_on is distinct from due then
        raise exception 'key conflict' using errcode='IN409';
      end if;
    end loop;
    return;
  end if;
  if existing_count <> 0 or p_first < (clock_timestamp() at time zone 'Asia/Bangkok')::date then
    raise exception 'invalid installment date or partial key' using errcode='IN422';
  end if;
  for i in 1..p_count loop
    month_start := (date_trunc('month',p_first) + make_interval(months => i-1))::date;
    due := month_start + (least(extract(day from p_first)::integer,extract(day from month_start + interval '1 month - 1 day')::integer)-1);
    amount_due := p_total/p_count + case when i <= p_total%p_count then 1 else 0 end;
    label := trim(p_title)||' · งวด '||i||'/'||p_count;
    insert into plans(user_id,cycle_id,kind,title,amount,due_on,status,idempotency_key)
    values(p_user,active_id,'bill',label,amount_due,due,'reserved','installment:'||p_key||':'||i);
  end loop;
end;
$$;
revoke all on function add_installments(uuid,uuid,text,bigint,integer,date,text) from public,anon,authenticated;
grant execute on function add_installments(uuid,uuid,text,bigint,integer,date,text) to service_role;
