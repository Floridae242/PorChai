-- Cloud projects do not grant new tables to service_role automatically (local stack does).
-- The server uses service_role for every read/write; anon and authenticated stay revoked.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Tables created by later migrations get the same access without repeating this.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public revoke all on tables from anon, authenticated;
