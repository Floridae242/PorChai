-- No initial points or catalog: campaign inventory is configured separately by the team.
create table points_wallets (
  user_id uuid primary key references users(id) on delete cascade,
  balance bigint not null default 0 check (balance between 0 and 9007199254740991)
);
create table rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  cost integer not null check (cost > 0),
  stock integer not null check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index rewards_catalog on rewards(created_at, id) where active;
create table reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  reward_id uuid not null references rewards(id),
  cost integer not null check (cost > 0),
  code text not null unique,
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('daily', 'redemption')),
  delta integer not null,
  earned_on date,
  claim_id uuid unique references reward_claims(id) on delete cascade,
  idempotency_key text check (length(trim(idempotency_key)) between 1 and 100),
  created_at timestamptz not null default now(),
  check ((kind = 'daily' and delta = 1 and earned_on is not null and claim_id is null and idempotency_key is not null)
    or (kind = 'redemption' and delta < 0 and earned_on is null and claim_id is not null and idempotency_key is null))
);
create unique index points_daily_once on points_ledger(user_id, earned_on) where kind = 'daily';
create unique index points_daily_key on points_ledger(user_id, idempotency_key) where kind = 'daily';
create index points_ledger_user on points_ledger(user_id, created_at);

alter table points_wallets enable row level security;
alter table rewards enable row level security;
alter table reward_claims enable row level security;
alter table points_ledger enable row level security;
revoke all on points_wallets, rewards, reward_claims, points_ledger from public, anon, authenticated;
grant all on points_wallets, rewards, reward_claims, points_ledger to service_role;

create function points_state(p_user uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('balance', coalesce((select balance from points_wallets where user_id=p_user),0),
    'claimedToday', exists(select 1 from points_ledger where user_id=p_user and kind='daily'
      and earned_on=(now() at time zone 'Asia/Bangkok')::date));
$$;

create function claim_daily_points(p_user uuid, p_key text) returns jsonb
language plpgsql set search_path = public as $$
declare wallet points_wallets; day date := (now() at time zone 'Asia/Bangkok')::date; previous date;
begin
  if p_key is null or length(trim(p_key)) not between 1 and 100 then
    raise exception using errcode='RW400', message='invalid_key';
  end if;
  insert into points_wallets(user_id) values(p_user) on conflict do nothing;
  select * into wallet from points_wallets where user_id=p_user for update;
  select earned_on into previous from points_ledger where user_id=p_user and kind='daily' and idempotency_key=p_key;
  if found and previous <> day then
    raise exception using errcode='RW409', message='idempotency_conflict';
  end if;
  if exists(select 1 from points_ledger where user_id=p_user and kind='daily' and earned_on=day) then
    return jsonb_build_object('balance',wallet.balance,'claimedToday',true,'created',false);
  end if;
  insert into points_ledger(user_id,kind,delta,earned_on,idempotency_key) values(p_user,'daily',1,day,p_key);
  update points_wallets set balance=balance+1 where user_id=p_user returning * into wallet;
  return jsonb_build_object('balance',wallet.balance,'claimedToday',true,'created',true);
end;
$$;

create function redeem_reward(p_user uuid, p_reward uuid, p_key text) returns jsonb
language plpgsql set search_path = public as $$
declare wallet points_wallets; item rewards; claim reward_claims;
begin
  if p_key is null or length(trim(p_key)) not between 1 and 100 then
    raise exception using errcode='RW400', message='invalid_key';
  end if;
  -- Every mutation locks wallet before inventory, including retries.
  insert into points_wallets(user_id) values(p_user) on conflict do nothing;
  select * into wallet from points_wallets where user_id=p_user for update;
  select * into claim from reward_claims where user_id=p_user and idempotency_key=p_key;
  if found then
    if claim.reward_id <> p_reward then
      raise exception using errcode='RW409', message='idempotency_conflict';
    end if;
    return jsonb_build_object('balance',wallet.balance,'code',claim.code,'created',false);
  end if;
  select * into item from rewards where id=p_reward for update;
  if not found or not item.active then raise exception using errcode='RW404', message='not_found'; end if;
  if item.stock < 1 then raise exception using errcode='RW409', message='out_of_stock'; end if;
  if wallet.balance < item.cost then raise exception using errcode='RW409', message='not_enough_points'; end if;
  insert into reward_claims(user_id,reward_id,cost,code,idempotency_key)
    values(p_user,p_reward,item.cost,'RW-' || upper(replace(gen_random_uuid()::text,'-','')),p_key) returning * into claim;
  update points_wallets set balance=balance-item.cost where user_id=p_user returning * into wallet;
  update rewards set stock=stock-1 where id=p_reward;
  insert into points_ledger(user_id,kind,delta,claim_id) values(p_user,'redemption',-item.cost,claim.id);
  return jsonb_build_object('balance',wallet.balance,'code',claim.code,'created',true);
end;
$$;
revoke all on function points_state(uuid), claim_daily_points(uuid,text), redeem_reward(uuid,uuid,text) from public, anon, authenticated;
grant execute on function points_state(uuid), claim_daily_points(uuid,text), redeem_reward(uuid,uuid,text) to service_role;
