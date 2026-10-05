-- 048: ERRORS PLAYERS HIT (Cody, 2026-10-04 to-do #3: "hear about errors players hit"). The page reports an unexpected error
-- (server/clienterrors.js); the same error from many players is ONE row with a count (fingerprint: what + where in the code),
-- so 500 players hitting one bug is one line on the admin screen, and Cody's Telegram hears about a NEW kind only. Cody marks one
-- fixed; if it comes back (a later build), it reopens. Private: only the game server reads and writes it. Safe to apply twice.
create table if not exists public.client_errors (
  fingerprint text primary key,
  message text not null check (length(message) <= 300),
  source text check (source is null or length(source) <= 200),   -- file:line:col in the game's code
  stack text check (stack is null or length(stack) <= 1200),
  page text check (page is null or length(page) <= 40),           -- the tab it happened on
  build text check (build is null or length(build) <= 20),        -- which publish of the site
  ua text check (ua is null or length(ua) <= 120),                -- the browser (shortened)
  count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'fixed')),
  fixed_at timestamptz
);
create index if not exists client_errors_open on public.client_errors (status, last_seen desc);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_games') then grant select, insert, update on public.client_errors to santa_games; end if;
end $$;
