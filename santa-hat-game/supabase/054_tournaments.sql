-- APPLIED live 2026-10-05 (through the Supabase connector).
-- 054: TOURNAMENTS (Cody 2026-10-05; server/tourney.js, server/referee.js; DESIGN_NOTES "TOURNAMENTS").
-- 1. A tournament's ranked points come as one result per player (match id 'tour-<id>'): the pot (5 per player/bot in round 1)
--    split over the final's top 8 can give 1st more than a match's ±100 (64 entrants: ~130). Tournament results may be 0..1000;
--    every other result keeps -100..100.
-- 2. Each finished (or called-off) tournament is kept: its rules, how many entered and the final standings (who Cody sends a
--    prize to). Written only by the match server's login; nobody else can read or write it.
-- 3. The match server may read a profile's wallet (public on Solana anyway), to know Cody's admin wallet (only it can make,
--    start or call off a tournament).
alter table public.ranked_results drop constraint if exists ranked_results_change_check;
alter table public.ranked_results add constraint ranked_results_change_check
  check (case when match_id like 'tour-%' then change between 0 and 1000 else change between -100 and 100 end);

create table if not exists public.tournaments (
  id text primary key check (id ~ '^[a-z0-9]{6,24}$'),
  code text not null,
  rules jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  entrants int not null default 0 check (entrants between 0 and 64),
  standings jsonb not null default '[]', -- [{ place, name, profile (null: a bot), points }]
  why text check (char_length(why) <= 200) -- called off: why
);
alter table public.tournaments enable row level security; -- no policies: the website can neither read nor write it
revoke all on public.tournaments from public, anon, authenticated;

create or replace function public.record_tournament(p jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.tournaments (id, code, rules, created_by, created_at, started_at, entrants, standings, why)
  values (p->>'id', p->>'code', coalesce(p->'rules', '{}'), nullif(p->>'by', '')::uuid, (p->>'createdAt')::timestamptz,
    nullif(p->>'startedAt', '')::timestamptz, coalesce((p->>'entrants')::int, 0), coalesce(p->'standings', '[]'), nullif(p->>'why', ''))
  on conflict (id) do nothing
$$;
revoke execute on function public.record_tournament(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_referee') then
    grant execute on function public.record_tournament(jsonb) to santa_referee;
    grant select (wallet) on public.profiles to santa_referee;
  end if;
end $$;
