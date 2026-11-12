-- Short chat memory (card 15 "AI เข้าใจคำถาม"): the last 10 lines a user and the bot said, at most
-- 30 minutes old, so a reply can follow the conversation («ข้าว» → «กี่บาท?» → «45»).
-- Both sides are kept: role 'user' is what was typed (or the button tapped), 'bot' is the answer.
-- pending: what the bot's answer waits for (bot lines only); only the newest line counts.
create table chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('user', 'bot')),
  body text not null check (char_length(body) <= 2000),
  pending jsonb check (pending is null or role = 'bot'),
  created_at timestamptz not null default now()
);

create index chat_messages_user on chat_messages (user_id, id desc);
create index chat_messages_created on chat_messages (created_at);

revoke all on chat_messages from anon, authenticated;
alter table chat_messages enable row level security;

-- Forgetting is done by the database on every new line, so no code path can skip it:
-- everyone's lines older than 30 minutes, and this user's lines beyond the newest 10.
-- (Lines of someone who never writes again wait for the next line from anyone; card 58's
-- scheduler sweeps them too.)
create function chat_messages_forget() returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from chat_messages where created_at < now() - interval '30 minutes';
  delete from chat_messages
  where user_id = new.user_id
    and id not in (select id from chat_messages where user_id = new.user_id order by id desc limit 10);
  return null;
end;
$$;

create trigger chat_messages_forget
  after insert on chat_messages
  for each row execute function chat_messages_forget();
