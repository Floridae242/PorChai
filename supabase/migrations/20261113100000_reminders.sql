-- Card 58: remind a spending habit once a day at the user's time; the user records, edits or skips it.

-- Settings screen (แอป › ตั้งค่า › การเตือน). Off until the user turns it on (card 58: "เตือนเฉพาะเมื่อผู้ใช้เปิดไว้").
create table reminder_settings (
  user_id uuid primary key references users (id) on delete cascade,
  enabled boolean not null default false,
  remind_at time not null default '12:30',
  paused_until date, -- no reminders up to and including this day
  updated_at timestamptz not null default now()
);

-- One row per habit per day: reminded, then recorded or skipped. The unique key is what keeps a
-- habit from being reminded twice in a day, by two scheduler runs or by the demo command.
create table reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  habit_key text not null,
  label text not null,
  amount bigint not null check (amount > 0), -- the usual amount shown on the card
  category text not null check (category in ('food', 'transport', 'supplies', 'other')),
  day date not null,
  status text not null default 'sent' check (status in ('sent', 'recorded', 'skipped')),
  entry_id uuid references entries (id),
  created_at timestamptz not null default now(),
  unique (user_id, habit_key, day)
);

create index reminder_log_user_day on reminder_log (user_id, day);

revoke all on reminder_settings, reminder_log from anon, authenticated;
alter table reminder_settings enable row level security;
alter table reminder_log enable row level security;

-- Scheduler: Supabase Cron every 15 minutes. It sweeps chat memory older than 30 minutes (the trigger
-- only runs when someone writes) and asks the app to send due reminders. The app's URL and secret
-- live in Vault, set by hand on the hosted project only (never in this public repo), so a local or
-- test database never calls anything.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function run_reminders() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
  url text;
begin
  delete from chat_messages where created_at < now() - interval '30 minutes';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  select decrypted_secret into url from vault.decrypted_secrets where name = 'reminders_url';
  if secret is null or url is null then
    return;
  end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function run_reminders() from public, anon, authenticated;

select cron.schedule('porchai-reminders', '*/15 * * * *', 'select public.run_reminders()');
