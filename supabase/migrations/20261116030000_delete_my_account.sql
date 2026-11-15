-- ลบข้อมูลของฉัน (DELETE /api/me): the account row goes and every table that holds the user's rows
-- cascades from users(id), in this one transaction — all of it or none. The AI quota row is keyed by
-- text, not a foreign key, so it goes by hand. Shared rows (rewards, price_hints) stay.
create function delete_my_account(p_user uuid) returns void
language plpgsql set search_path = public as $$
begin
  if p_user is null then raise exception 'missing user'; end if;
  delete from users where id = p_user;
  delete from ai_rate_windows where scope = 'user:' || p_user;
end;
$$;
revoke all on function delete_my_account(uuid) from public, anon, authenticated;
grant execute on function delete_my_account(uuid) to service_role;
