-- APPLIED live 2026-10-02 (through the Supabase connector).
-- 018: RANKED on the referee server (server/referee.js), 2026-10-02. Rank points recorded once per match per player, and the
-- referee's login (017) allowed to use the ranked tickets (006): hold on joining, spend at the start, release on leaving before.
-- The points themselves are worked out by mockups/ranked.js (settleRanked) on the referee; the database keeps them honest:
-- one result per match per player, rank points never below 0.

create table public.ranked_results (
  match_id text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  change int not null check (change between -100 and 100),
  at timestamptz not null default now(),
  primary key (match_id, profile_id)
);
alter table public.ranked_results enable row level security;
revoke all on public.ranked_results from anon, authenticated;

-- One player's result in one ranked match: applied once (a repeat changes nothing). Returns their rank points after it.
create function public.record_ranked_result(p_match text, p_profile uuid, p_change int) returns int
language plpgsql security definer set search_path = '' as $$
declare pts int;
begin
  insert into public.ranked_results (match_id, profile_id, change) values (p_match, p_profile, p_change) on conflict do nothing;
  if found then
    update public.profiles set rank_points = greatest(0, rank_points + p_change) where id = p_profile returning rank_points into pts;
  else select rank_points into pts from public.profiles where id = p_profile; end if;
  return pts;
end $$;

-- The referee restarted: every ticket still HELD for one of its rooms (match ids starting with p_prefix) goes back, because
-- those rooms are gone (otherwise a crash would silently keep players' tickets). Returns how many came back.
create function public.release_room_holds(p_prefix text) returns int
language plpgsql security definer set search_path = '' as $$
declare h record; n int := 0;
begin
  if char_length(p_prefix) < 3 then raise exception 'prefix too short'; end if;
  for h in select profile_id, match_id from public.ticket_holds where state = 'held' and starts_with(match_id, p_prefix) loop
    if public.release_ticket(h.profile_id, h.match_id) then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.record_ranked_result(text, uuid, int), public.release_room_holds(text) from public, anon, authenticated;

-- Holding again after leaving: 006's hold_ticket answered 'already' for ANY earlier hold in that match, so a player who left
-- a ranked room before its start (ticket given back) could never rejoin that same room (found by tests/referee-ranked.test.mjs).
-- Now a RELEASED hold can be taken again, charging a ticket again; a held or spent one is still 'already'.
create or replace function public.hold_ticket(p_profile uuid, p_match text, p_now timestamptz default now()) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; src text; was text;
begin
  t := public.tickets_row(p_profile, p_now);
  select state into was from public.ticket_holds where profile_id = p_profile and match_id = p_match;
  if was is not null and was <> 'released' then return 'already'; end if;
  if t.free_used < 10 then
    update public.tickets set free_used = free_used + 1 where profile_id = p_profile; src := 'free';
  elsif t.extra > 0 then
    update public.tickets set extra = extra - 1 where profile_id = p_profile; src := 'extra';
  else return 'none'; end if;
  insert into public.ticket_holds (profile_id, match_id, source, at) values (p_profile, p_match, src, p_now)
    on conflict (profile_id, match_id) do update set source = excluded.source, state = 'held', at = excluded.at;
  return src;
end $$;
revoke execute on function public.hold_ticket(uuid, text, timestamptz) from public, anon, authenticated;

-- The referee's lookup also returns rank points (ranked matching: similar points first).
drop function public.referee_profile(uuid);
create function public.referee_profile(p_user uuid) returns table (id uuid, level int, avatar jsonb, name text, rank_points int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.level, p.avatar, p.name, p.rank_points from public.logins l join public.profiles p on p.id = l.profile_id where l.user_id = p_user
$$;
revoke execute on function public.referee_profile(uuid) from public, anon, authenticated;

grant execute on function public.referee_profile(uuid), public.record_ranked_result(text, uuid, int), public.release_room_holds(text),
  public.hold_ticket(uuid, text, timestamptz), public.start_ranked_match(text), public.release_ticket(uuid, text),
  public.ticket_status(uuid, timestamptz) to santa_referee;
