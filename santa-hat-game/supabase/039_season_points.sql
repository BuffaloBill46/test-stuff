-- 039: SEASON POINTS (Cody, 2026-10-04). Replaces 033's "finish the day's 3 tasks to open that day's door" with points and a
-- track of 30 doors, one every 300 points, each with a free prize and a pass prize. Rules in mockups/seasons.js (this mirrors
-- them; tests/db/seasons-db.test.mjs checks they agree).
--   Points a game day (at most 700): 5 daily tasks × 100 ("Log in", "Play 2 Auto matches", 3 that rotate); each of the day's
--   first 10 public Auto matches +10, and +10 more for a top-3 finish in it.
--   Free track: 5 season looks, a level step on the other doors. Pass track: the 6 costume pieces (doors 2, 6, 10, 14, 18, 22),
--   5 level steps (4, 8, 12, 17, 21), 2 special gear items (15: Elf Hat, 30: I.C.E. Kevlar Vest), a ranked ticket on every
--   other door. Season tickets go in their own bank (tickets.season_extra), no cap; ranked spends free, then season, then bought.
--   The calendar stays: a day with every task done is a PERFECT day (season_progress.door); 7 perfect days in a row: a level step.
-- Matches still count only through season_record (the match server); "Log in" only through season_login (the game server, for a
-- signed-in player). Every grant still happens once, by primary key. Safe to apply twice.

-- points per day, and the counters behind them
alter table public.season_progress add column if not exists points int not null default 0;
alter table public.season_progress add column if not exists matches_scored int not null default 0;
alter table public.season_progress add column if not exists top3_scored int not null default 0;

-- prizes: a reward is now exactly one of an item, a level step or ranked tickets
alter table public.season_rewards add column if not exists tickets int check (tickets is null or tickets between 1 and 5);
alter table public.season_rewards drop constraint if exists season_rewards_check;
alter table public.season_rewards drop constraint if exists season_rewards_one_check;
alter table public.season_rewards add constraint season_rewards_one_check check (num_nonnulls(item_id, xp, tickets) = 1);
alter table public.season_grants add column if not exists tickets int;

-- the 30-door tracks for all three seasons (seasons.js SEASONS: free looks by door; the pass track has the same shape each season)
delete from public.season_rewards where season in ('halloween', 'thanksgiving', 'christmas');
insert into public.season_rewards (season, door, track, item_id, xp)
  select f.season, d, 'free', f.look, case when f.look is null then 1 end
  from generate_series(1, 30) d
  cross join lateral (select s.season, (s.looks ->> d::text) as look from (values
    ('halloween', '{"2":"snow_candycorn","5":"shirt_jackolantern","9":"pants_midnight","14":"snow_ghostly","20":"pants_pumpkin"}'::jsonb),
    ('thanksgiving', '{"2":"snow_cranberry","5":"shirt_pumpkinpie","9":"pants_harvestgold","14":"snow_mapleleaf","20":"shirt_cornhusk"}'::jsonb),
    ('christmas', '{"2":"snow_candycane","5":"shirt_peppermint","9":"pants_evergreen","14":"snow_silverflake","20":"pants_hollyred"}'::jsonb)
  ) s(season, looks)) f;
insert into public.season_rewards (season, door, track, item_id, xp, tickets)
  select c.season, d, 'gold',
    case when d = any(array[2, 6, 10, 14, 18, 22]) then c.pieces[array_position(array[2, 6, 10, 14, 18, 22], d)]
         when d = 15 then 'gear_elfhat' when d = 30 then 'gear_kevlar' end,
    case when d = any(array[4, 8, 12, 17, 21]) then 1 end,
    case when not (d = any(array[2, 6, 10, 14, 18, 22, 15, 30, 4, 8, 12, 17, 21])) then 1 end
  from generate_series(1, 30) d
  cross join (values
    ('halloween', array['face_pumpkinking', 'hat_pumpkinking', 'shirt_pumpkinking', 'pants_pumpkinking', 'pack_pumpkinking', 'snow_pumpkinking']),
    ('thanksgiving', array['face_gobbler', 'hat_gobbler', 'shirt_gobbler', 'pants_gobbler', 'pack_gobbler', 'snow_gobbler']),
    ('christmas', array['face_gingerbread', 'hat_gingerbread', 'shirt_gingerbread', 'pants_gingerbread', 'pack_gingerbread', 'snow_gingerbread'])
  ) c(season, pieces);

-- (added after the old 31-door rows are replaced)
alter table public.season_rewards drop constraint if exists season_rewards_door_check;
alter table public.season_rewards add constraint season_rewards_door_check check (door between 1 and 30);

-- the season ticket bank: no cap, never expires; ranked spends today's free tickets, then season ones, then bought ones
alter table public.tickets add column if not exists season_extra int not null default 0 check (season_extra >= 0);
alter table public.ticket_holds drop constraint if exists ticket_holds_source_check;
alter table public.ticket_holds add constraint ticket_holds_source_check check (source in ('free', 'season', 'extra'));
create or replace function public.hold_ticket(p_profile uuid, p_match text, p_now timestamptz default now()) returns text
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; src text; was text;
begin
  t := public.tickets_row(p_profile, p_now);
  select state into was from public.ticket_holds where profile_id = p_profile and match_id = p_match;
  if was is not null and was <> 'released' then return 'already'; end if;
  if t.free_used < 10 then update public.tickets set free_used = free_used + 1 where profile_id = p_profile; src := 'free';
  elsif t.season_extra > 0 then update public.tickets set season_extra = season_extra - 1 where profile_id = p_profile; src := 'season';
  elsif t.extra > 0 then update public.tickets set extra = extra - 1 where profile_id = p_profile; src := 'extra';
  else return 'none'; end if;
  insert into public.ticket_holds (profile_id, match_id, source, at) values (p_profile, p_match, src, p_now)
    on conflict (profile_id, match_id) do update set source = excluded.source, state = 'held', at = excluded.at;
  return src;
end $$;
create or replace function public.release_ticket(p_profile uuid, p_match text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare h public.ticket_holds;
begin
  update public.ticket_holds set state = 'released' where profile_id = p_profile and match_id = p_match and state = 'held' returning * into h;
  if h.profile_id is null then return false; end if;
  -- a free ticket from before the last daily reset isn't given back (today's count already started fresh)
  if h.source = 'free' then update public.tickets set free_used = greatest(0, free_used - 1) where profile_id = p_profile and window_start <= h.at;
  elsif h.source = 'season' then update public.tickets set season_extra = season_extra + 1 where profile_id = p_profile;
  else update public.tickets set extra = extra + 1 where profile_id = p_profile; end if;
  return true;
end $$;
-- what the player sees: 'extra' now counts season tickets too (same columns, so every reader keeps working)
create or replace function public.ticket_status(p_profile uuid, p_now timestamptz default now())
returns table (free_left int, extra int, held int, resets_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; h int;
begin
  t := public.tickets_row(p_profile, p_now);
  select count(*)::int into h from public.ticket_holds where profile_id = p_profile and state = 'held';
  return query select 10 - t.free_used, t.extra + t.season_extra, h, public.game_day_next(p_now);
end $$;

-- A day's points from its row: 100 per task done, +10 per scored match, +10 per scored top 3 (seasons.js dayPoints)
create or replace function public.season_day_points(p_stats jsonb, p_tasks jsonb, p_matches int, p_top3 int) returns int
language sql immutable set search_path = '' as $$
  select (select count(*)::int from jsonb_array_elements(p_tasks) x where coalesce((p_stats ->> (x ->> 'stat'))::int, 0) >= (x ->> 'need')::int) * 100
    + least(p_matches, 10) * 10 + least(p_top3, p_matches, 10) * 10
$$;

-- shared by season_record and season_login: today's row with this delta added, its points and perfect-day flag worked out,
-- then everything earned granted. p_match: this call is a finished Auto match (scores its +10 / top-3 +10, the first 10 a day).
create or replace function public.season_apply(p_profile uuid, p_season text, p_day date, p_tasks jsonb, p_delta jsonb, p_match boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.seasons; t jsonb; st jsonb; k text; pr public.season_progress; done boolean := true; pts int;
begin
  select * into s from public.seasons where id = p_season;
  if s.id is null or now() < s.starts or now() >= s.ends then return jsonb_build_object('off', true); end if;
  if p_day <> public.season_day(now()) then raise exception 'not today''s game day'; end if;
  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) not between 3 and 5 then raise exception 'bad tasks'; end if;
  insert into public.season_days (season, day, tasks) values (p_season, p_day, p_tasks) on conflict do nothing;
  select tasks into t from public.season_days where season = p_season and day = p_day;
  insert into public.season_progress (profile_id, season, day) values (p_profile, p_season, p_day) on conflict do nothing;
  select * into pr from public.season_progress where profile_id = p_profile and season = p_season and day = p_day for update;
  st := pr.stats;
  foreach k in array array['login', 'games', 'top3', 'wins', 'hits', 'hatSec', 'steals', 'catches', 'specials'] loop
    if p_delta ? k then st := jsonb_set(st, array[k], to_jsonb(coalesce((st ->> k)::int, 0) + greatest(0, least(coalesce((p_delta ->> k)::int, 0), 500)))); end if;
  end loop;
  if (st ->> 'login')::int > 1 then st := jsonb_set(st, array['login'], '1'); end if;
  if p_match and pr.matches_scored < 10 then
    pr.matches_scored := pr.matches_scored + 1;
    if coalesce((p_delta ->> 'top3')::int, 0) > 0 then pr.top3_scored := pr.top3_scored + 1; end if;
  end if;
  for k in select x ->> 'stat' from jsonb_array_elements(t) x loop
    if coalesce((st ->> k)::int, 0) < (select (x ->> 'need')::int from jsonb_array_elements(t) x where x ->> 'stat' = k limit 1) then done := false; end if;
  end loop;
  pts := public.season_day_points(st, t, pr.matches_scored, pr.top3_scored);
  update public.season_progress set stats = st, points = pts, matches_scored = pr.matches_scored, top3_scored = pr.top3_scored,
    door = door or done, opened_at = case when not door and done then now() else opened_at end
    where profile_id = p_profile and season = p_season and day = p_day;
  return jsonb_build_object('stats', st, 'points', pts, 'door', done, 'granted', public.season_grant(p_profile, p_season));
end $$;

-- RECORD one finished public Auto match (the match server only); 'login' can never come from a match
create or replace function public.season_record(p_profile uuid, p_season text, p_day date, p_tasks jsonb, p_delta jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public.season_apply(p_profile, p_season, p_day, p_tasks, coalesce(p_delta, '{}') - 'login', true);
end $$;
-- LOG IN: the game server, when a signed-in player's season is read (server/seasons.js); only ever sets today's login
create or replace function public.season_login(p_profile uuid, p_season text, p_day date, p_tasks jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st jsonb;
begin
  select stats into st from public.season_progress where profile_id = p_profile and season = p_season and day = p_day;
  if coalesce((st ->> 'login')::int, 0) >= 1 then return jsonb_build_object('already', true); end if;
  return public.season_apply(p_profile, p_season, p_day, p_tasks, '{"login": 1}', false);
end $$;

-- GRANT every reward a player has earned in a season and not yet received (each exactly once, by primary key):
-- doors = the season's points ÷ 300 (at most 30); the pass track only with the pass; the streak bonus from perfect days.
create or replace function public.season_grant(p_profile uuid, p_season text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare doors int; has_pass boolean; r record; got jsonb := '[]'; streak int := 0; d date; k int; t public.tickets;
begin
  select least(30, coalesce(sum(points), 0) / 300)::int into doors from public.season_progress where profile_id = p_profile and season = p_season;
  has_pass := exists (select 1 from public.season_passes where profile_id = p_profile and season = p_season);
  for r in select * from public.season_rewards where season = p_season and door <= doors and (track = 'free' or has_pass) order by door, track loop
    insert into public.season_grants (profile_id, season, door, track, item_id, xp, tickets) values (p_profile, p_season, r.door, r.track, r.item_id, r.xp, r.tickets)
      on conflict do nothing;
    if found then
      if r.item_id is not null then
        insert into public.inventory (profile_id, item_id) values (p_profile, r.item_id) on conflict do nothing;
        -- gear already owned and worn out: like buying it again, a fresh 7 days (015); not worn out: it simply stays
        if public.gear_worn_out(p_profile, r.item_id) then delete from public.gear_wear where profile_id = p_profile and item_id = r.item_id; end if;
      elsif r.tickets is not null then
        t := public.tickets_row(p_profile, now());
        update public.tickets set season_extra = season_extra + r.tickets where profile_id = p_profile;
      else perform public.season_xp(p_profile, p_season, r.door, r.track); end if;
      got := got || jsonb_build_object('door', r.door, 'track', r.track, 'item', r.item_id, 'xp', r.xp, 'tickets', r.tickets);
    end if;
  end loop;
  -- the streak: perfect days in a row, ending at the latest perfect day; a bonus at 7, 14, 21, 28 …
  for d in select day from public.season_progress where profile_id = p_profile and season = p_season and door order by day desc loop
    exit when streak > 0 and d <> (select max(day) from public.season_progress where profile_id = p_profile and season = p_season and door) - streak;
    streak := streak + 1;
  end loop;
  k := 7;
  while k <= streak loop
    insert into public.season_grants (profile_id, season, door, track, xp) values (p_profile, p_season, k, 'streak', 1) on conflict do nothing;
    if found then perform public.season_xp(p_profile, p_season, k, 'streak'); got := got || jsonb_build_object('door', k, 'track', 'streak', 'xp', 1); end if;
    k := k + 7;
  end loop;
  return got;
end $$;

revoke execute on function public.season_apply(uuid, text, date, jsonb, jsonb, boolean), public.season_record(uuid, text, date, jsonb, jsonb),
  public.season_login(uuid, text, date, jsonb), public.season_grant(uuid, text), public.season_day_points(jsonb, jsonb, int, int),
  public.hold_ticket(uuid, text, timestamptz), public.release_ticket(uuid, text), public.ticket_status(uuid, timestamptz) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_referee') then
    grant execute on function public.season_record(uuid, text, date, jsonb, jsonb) to santa_referee;
  end if;
  if exists (select 1 from pg_roles where rolname = 'santa_games') then
    grant execute on function public.season_login(uuid, text, date, jsonb) to santa_games;
  end if;
end $$;
