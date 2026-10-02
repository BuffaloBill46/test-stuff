-- APPLIED live 2026-10-01 (function bodies hash-checked against this file). Player match stats for the match load screen (Cody, 2026-10-01: total games played, top-3 win %, level, rank
-- points). Every Auto match finish of a player with an account is recorded once (the host reports it: server/levels.js finish);
-- games played = how many, top-3 % = how many of them placed 1st–3rd. Server-only writes; the totals are public (like the
-- leaderboard), the per-match rows are not.
create table public.match_results (
  match_id text not null check (char_length(match_id) between 8 and 80),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  place int not null check (place between 1 and 8),
  players int not null check (players between 1 and 8 and players >= place),
  at timestamptz not null default now(),
  primary key (match_id, profile_id)
);
alter table public.match_results enable row level security;
revoke all on public.match_results from anon, authenticated;

-- One finish (once per match per player; a resent report changes nothing).
create function public.record_match_result(p_match text, p_profile uuid, p_place int, p_players int) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.match_results (match_id, profile_id, place, players) values (p_match, p_profile, p_place, p_players) on conflict do nothing;
  return found;
end $$;
revoke execute on function public.record_match_result from public, anon, authenticated;

-- The totals for the load screen: games played and top-3 finishes per player (read by the server's public 'stats' action).
create function public.player_stats(p_ids uuid[]) returns table (profile_id uuid, games int, top3 int, level int, rank_points int)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(count(m.match_id), 0)::int, coalesce(count(m.match_id) filter (where m.place <= 3), 0)::int, p.level, p.rank_points
  from public.profiles p left join public.match_results m on m.profile_id = p.id
  where p.id = any (p_ids) group by p.id, p.level, p.rank_points
$$;
revoke execute on function public.player_stats from public, anon, authenticated;
