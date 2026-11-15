create function entry_search(p_user uuid,p_query text,p_from date,p_until date) returns jsonb
language plpgsql stable set search_path=public as $$
declare result jsonb;
begin
  if p_query is null or length(trim(p_query)) not between 1 and 120 or p_from is null or p_until is null or p_until<=p_from or p_until-p_from>366 then raise exception 'invalid search'; end if;
  with matched as (
    select id,note,amount,category,spent_on,created_at
    from entries where user_id=p_user and cancelled_at is null and spent_on>=p_from and spent_on<p_until
      and strpos(lower(coalesce(note,'')),lower(p_query))>0
  ), page as (select * from matched order by spent_on desc,created_at desc,id limit 50)
  select jsonb_build_object('count',(select count(*) from matched),'total',coalesce((select sum(amount) from matched),0),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'note',note,'amount',amount,'category',category,'spentOn',spent_on) order by spent_on desc,created_at desc,id) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function entry_search(uuid,text,date,date) from public,anon,authenticated;
grant execute on function entry_search(uuid,text,date,date) to service_role;
