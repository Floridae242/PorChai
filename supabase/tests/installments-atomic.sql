-- Local-only failure injection. The constraint, fixtures and all writes roll back on disconnect.
-- Run after the local migration with psql -v ON_ERROR_STOP=1 against the development database.
begin;
alter table plans add constraint test_installment_second_insert_fails
  check (title <> 'atomic-installment-test · งวด 2/3') not valid;
do $$
declare
  u uuid;
  c uuid;
  today date := (clock_timestamp() at time zone 'Asia/Bangkok')::date;
  failed boolean := false;
begin
  insert into users(line_user_id) values('U_atomic_installment_'||gen_random_uuid()) returning id into u;
  insert into cycles(user_id,start_balance,payday) values(u,500000,today+12) returning id into c;
  begin
    perform add_installments(u,c,'atomic-installment-test',100001,3,today,'atomic-rollback-test');
  exception when check_violation then
    failed := true;
  end;
  if not failed then raise exception 'expected second installment to fail'; end if;
  if exists(select 1 from plans where user_id=u) then raise exception 'partial installment schedule survived rollback'; end if;
  if has_function_privilege('anon','add_installments(uuid,uuid,text,bigint,integer,date,text)','execute')
    or has_function_privilege('authenticated','add_installments(uuid,uuid,text,bigint,integer,date,text)','execute') then
    raise exception 'untrusted role can create installments';
  end if;
  raise notice 'PASS: second-insert failure rolled back every installment; untrusted roles denied';
end;
$$;
rollback;
