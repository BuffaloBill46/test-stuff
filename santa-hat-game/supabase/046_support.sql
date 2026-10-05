-- 046: SUPPORT MESSAGES (Cody, 2026-10-04: "create a support button and build a system for it that admin wallet tracks or telegram
-- bot messages me"). A player (signed in or not: the ones who can't sign in need help most) sends a message from the sign-in sheet;
-- the game server (server/support.js) keeps it here and Cody's Telegram bot sends it to him at once; the admin screen lists the open
-- ones and Cody marks each handled (signed with his admin wallet). Private: the website can't read or write it (only the game
-- server's own login). address_hash: a one-way fingerprint of the sender's connection, only to cap messages per hour (never the
-- address itself). Safe to apply twice.
create table if not exists public.support_messages (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  profile_id uuid references public.profiles (id) on delete set null,  -- signed in: who (name and wallet shown to Cody)
  contact text check (contact is null or length(contact) <= 120),     -- how to reach them (email, X handle), if they gave one
  message text not null check (length(message) between 1 and 1000),
  page text check (page is null or length(page) <= 40),               -- where they were (the tab), to help Cody find the problem
  address_hash text,
  status text not null default 'open' check (status in ('open', 'handled')),
  handled_at timestamptz,
  handled_by text,                                                    -- the admin wallet that marked it
  note text check (note is null or length(note) <= 300)
);
create index if not exists support_messages_open on public.support_messages (status, created_at);
alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_games') then
    grant select, insert, update on public.support_messages to santa_games;
    grant usage on sequence public.support_messages_id_seq to santa_games;
  end if;
end $$;
