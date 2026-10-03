-- 033: SEASONS (Cody, 2026-10-03; rules in mockups/seasons.js, which this file mirrors: tests/db/seasons-db.test.mjs checks they
-- agree). Halloween (to Oct 31), Thanksgiving (November), Christmas (Dec 1 to New Year's Day). Each game day (9 PM to 9 PM Indiana
-- time, 030) has 3 daily tasks; finishing them opens that day's DOOR. Free track: every door gives a season look or one step of
-- level progress (like a top-3 finish), plus a bonus step every 7 days in a row. Gold track (the $5 season pass, bought like a Store item): the season's
-- costume, a piece every 3 doors, backdated when bought late. Progress comes ONLY from public Auto matches the match server ran
-- (server/levels.js finishByReferee); nothing a page sends counts. Every grant happens once (primary keys), in the database.
-- Safe to apply twice.

-- the season look column (032 adds it too) and the free Halloween looks: colour-only items, no level and no price (earned only)
alter table public.items add column if not exists season text;
alter table public.items drop constraint if exists items_check;
alter table public.items add constraint items_check check (
  (season is not null and unlock_level is null and price_usd is null) or (season is null and ((unlock_level is null) <> (price_usd is null))));
insert into public.items (id, slot, name, season) values
  ('snow_candycorn', 'snow', 'Candy Corn', 'halloween'),
  ('shirt_jackolantern', 'shirt', 'Jack-o''-Lantern Orange', 'halloween'),
  ('pants_midnight', 'pants', 'Midnight Purple', 'halloween'),
  ('snow_ghostly', 'snow', 'Ghostly Glow', 'halloween'),
  ('pants_pumpkin', 'pants', 'Pumpkin Patch', 'halloween')
on conflict (id) do update set slot = excluded.slot, name = excluded.name, season = excluded.season, unlock_level = null, price_usd = null;

-- the seasons and what each door gives (mirrors seasons.js SEASONS; the test compares them)
create table if not exists public.seasons (
  id text primary key, name text not null, starts timestamptz not null, ends timestamptz not null, pass_usd numeric(10, 2) not null check (pass_usd > 0)
);
create table if not exists public.season_rewards (
  season text not null references public.seasons (id), door int not null check (door >= 1), track text not null check (track in ('free', 'gold')),
  item_id text references public.items (id), xp int check (xp = 1),
  check ((item_id is null) <> (xp is null)), primary key (season, door, track)
);
insert into public.seasons (id, name, starts, ends, pass_usd) values
  ('halloween', 'Halloween', '2026-10-01 01:00+00', '2026-11-01 01:00+00', 5),
  ('thanksgiving', 'Thanksgiving', '2026-11-01 01:00+00', '2026-12-01 02:00+00', 5),
  ('christmas', 'Christmas', '2026-12-01 02:00+00', '2027-01-02 02:00+00', 5)
on conflict (id) do update set name = excluded.name, starts = excluded.starts, ends = excluded.ends, pass_usd = excluded.pass_usd;
delete from public.season_rewards where season = 'halloween';
insert into public.season_rewards (season, door, track, item_id, xp)
  select 'halloween', d, 'free', case d when 2 then 'snow_candycorn' when 5 then 'shirt_jackolantern' when 9 then 'pants_midnight' when 14 then 'snow_ghostly' when 20 then 'pants_pumpkin' end,
    case when d in (2, 5, 9, 14, 20) then null else 1 end
  from generate_series(1, 31) d;
-- the gold pieces are added when the costume exists (032 makes the items); a piece every 3 doors
insert into public.season_rewards (season, door, track, item_id)
  select 'halloween', g.door, 'gold', g.item from (values (3, 'face_pumpkinking'), (6, 'hat_pumpkinking'), (9, 'shirt_pumpkinking'), (12, 'pants_pumpkinking'), (15, 'pack_pumpkinking'), (18, 'snow_pumpkinking')) g(door, item)
  where exists (select 1 from public.items i where i.id = g.item);

-- a day's 3 tasks (stored by the first match of the day, so the rules never change under a player), progress, passes, grants
create table if not exists public.season_days (season text not null references public.seasons (id), day date not null, tasks jsonb not null, primary key (season, day));
create table if not exists public.season_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade, season text not null references public.seasons (id), day date not null,
  stats jsonb not null default '{}', door boolean not null default false, opened_at timestamptz, primary key (profile_id, season, day)
);
create table if not exists public.season_passes (
  profile_id uuid not null references public.profiles (id) on delete cascade, season text not null references public.seasons (id),
  signature text unique, usd numeric(10, 2), paid_raw bigint, bought_at timestamptz not null default now(), primary key (profile_id, season)
);
create table if not exists public.season_grants (
  profile_id uuid not null references public.profiles (id) on delete cascade, season text not null references public.seasons (id),
  door int not null, track text not null check (track in ('free', 'gold', 'streak')), item_id text references public.items (id), xp int,
  at timestamptz not null default now(), primary key (profile_id, season, door, track)
);
alter table public.seasons enable row level security; alter table public.season_rewards enable row level security; alter table public.season_days enable row level security;
alter table public.season_progress enable row level security; alter table public.season_passes enable row level security; alter table public.season_grants enable row level security;
drop policy if exists seasons_read on public.seasons; create policy seasons_read on public.seasons for select using (true);
drop policy if exists season_rewards_read on public.season_rewards; create policy season_rewards_read on public.season_rewards for select using (true);
drop policy if exists season_days_read on public.season_days; create policy season_days_read on public.season_days for select using (true);
drop policy if exists season_progress_own on public.season_progress; create policy season_progress_own on public.season_progress for select using (profile_id = (select auth.uid()));
drop policy if exists season_passes_own on public.season_passes; create policy season_passes_own on public.season_passes for select using (profile_id = (select auth.uid()));
drop policy if exists season_grants_own on public.season_grants; create policy season_grants_own on public.season_grants for select using (profile_id = (select auth.uid()));
revoke insert, update, delete on public.seasons, public.season_rewards, public.season_days, public.season_progress, public.season_passes, public.season_grants from anon, authenticated;

-- The game day a moment belongs to, named by the calendar date it mostly covers (9 PM Oct 3 to 9 PM Oct 4 = 2026-10-04): seasons.js dayKey
create or replace function public.season_day(p_t timestamptz) returns date
language sql stable set search_path = '' as $$
  select ((public.game_day_start(p_t) + interval '12 hours') at time zone 'America/Indiana/Indianapolis')::date
$$;

-- GRANT every reward a player has earned in a season and not yet received (each exactly once, by primary key).
create or replace function public.season_grant(p_profile uuid, p_season text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare doors int; has_pass boolean; r record; got jsonb := '[]'; streak int := 0; d date; k int;
begin
  select count(*) into doors from public.season_progress where profile_id = p_profile and season = p_season and door;
  has_pass := exists (select 1 from public.season_passes where profile_id = p_profile and season = p_season);
  for r in select * from public.season_rewards where season = p_season and door <= doors and (track = 'free' or has_pass) order by door, track loop
    insert into public.season_grants (profile_id, season, door, track, item_id, xp) values (p_profile, p_season, r.door, r.track, r.item_id, r.xp)
      on conflict do nothing;
    if found then
      if r.item_id is not null then insert into public.inventory (profile_id, item_id) values (p_profile, r.item_id) on conflict do nothing;
      else perform public.season_xp(p_profile, p_season, r.door, 'free'); end if;
      got := got || jsonb_build_object('door', r.door, 'track', r.track, 'item', r.item_id, 'xp', r.xp);
    end if;
  end loop;
  -- the streak: days in a row with the door open, ending at the latest open door; a bonus at 7, 14, 21, 28 …
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

-- one step of level progress from a season reward: counted exactly like a top-3 finish (010 record_level_finish: once per
-- reward, by its own id; at level 9 only 1st places count, so a season step there is recorded but moves nothing)
create or replace function public.season_xp(p_profile uuid, p_season text, p_door int, p_track text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_level_finish('season:' || p_season || ':' || p_track || ':' || p_door, p_profile, 3);
end $$;

-- RECORD one finished public Auto match for one player (called by the match server only). p_tasks: today's tasks from
-- seasons.js (kept from the first call of the day); p_delta: this match's counts. Opens today's door when every task is met.
create or replace function public.season_record(p_profile uuid, p_season text, p_day date, p_tasks jsonb, p_delta jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.seasons; t jsonb; st jsonb; k text; done boolean := true; opened boolean := false;
begin
  select * into s from public.seasons where id = p_season;
  if s.id is null or now() < s.starts or now() >= s.ends then return jsonb_build_object('off', true); end if;
  if p_day <> public.season_day(now()) then raise exception 'not today''s game day'; end if;
  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) <> 3 then raise exception 'bad tasks'; end if;
  insert into public.season_days (season, day, tasks) values (p_season, p_day, p_tasks) on conflict do nothing;
  select tasks into t from public.season_days where season = p_season and day = p_day;
  insert into public.season_progress (profile_id, season, day) values (p_profile, p_season, p_day) on conflict do nothing;
  select stats into st from public.season_progress where profile_id = p_profile and season = p_season and day = p_day for update;
  foreach k in array array['games', 'top3', 'hits', 'hatSec', 'steals', 'catches', 'specials'] loop
    if p_delta ? k then st := jsonb_set(st, array[k], to_jsonb(coalesce((st ->> k)::int, 0) + greatest(0, least(coalesce((p_delta ->> k)::int, 0), 500)))); end if;
  end loop;
  for k in select x ->> 'stat' from jsonb_array_elements(t) x loop
    if coalesce((st ->> k)::int, 0) < (select (x ->> 'need')::int from jsonb_array_elements(t) x where x ->> 'stat' = k limit 1) then done := false; end if;
  end loop;
  update public.season_progress set stats = st, door = door or done, opened_at = case when not door and done then now() else opened_at end
    where profile_id = p_profile and season = p_season and day = p_day returning (door and opened_at >= now() - interval '1 second') into opened;
  return jsonb_build_object('stats', st, 'door', done, 'granted', case when done then public.season_grant(p_profile, p_season) else '[]'::jsonb end);
end $$;

-- the season pass as a Store purchase: shop_quotes gets the season, shop_grant (016) learns kind 'pass'
alter table public.shop_quotes add column if not exists season text references public.seasons (id);
alter table public.shop_quotes drop constraint if exists shop_quotes_kind_check;
alter table public.shop_quotes add constraint shop_quotes_kind_check check (kind in ('item', 'level', 'tickets', 'pass'));
create or replace function public.shop_grant(q public.shop_quotes, p_signature text, p_paid bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owned boolean; lvl int; extra int; s public.seasons;
begin
  if q.kind = 'item' then
    owned := exists (select 1 from public.inventory where profile_id = q.profile_id and item_id = q.item_id);
    if owned and not public.gear_worn_out(q.profile_id, q.item_id) then raise exception 'you already own that'; end if;
    insert into public.item_purchases (signature, profile_id, item_id, usd, paid_raw) values (p_signature, q.profile_id, q.item_id, q.usd, p_paid);
    insert into public.inventory (profile_id, item_id) values (q.profile_id, q.item_id) on conflict do nothing;
    delete from public.gear_wear where profile_id = q.profile_id and item_id = q.item_id;  -- worn-out gear bought again: a fresh 7 days
    return jsonb_build_object('item', q.item_id);
  elsif q.kind = 'level' then
    lvl := public.buy_level(q.profile_id, p_signature, p_paid, q.to_level);
    return jsonb_build_object('level', lvl);
  elsif q.kind = 'pass' then
    select * into s from public.seasons where id = q.season;
    if s.id is null or now() >= s.ends then raise exception 'this season has ended'; end if;
    -- checked by name, never left to the unique key: shop_buy re-raises "duplicate key" as a reused payment (not owed), but a
    -- second real payment for a pass already owned IS owed back in full
    if exists (select 1 from public.season_passes where profile_id = q.profile_id and season = q.season) then raise exception 'you already have this season''s pass'; end if;
    insert into public.season_passes (profile_id, season, signature, usd, paid_raw) values (q.profile_id, q.season, p_signature, q.usd, p_paid);
    return jsonb_build_object('pass', q.season, 'granted', public.season_grant(q.profile_id, q.season));
  else
    extra := public.buy_tickets(q.profile_id, q.n, p_signature);
    return jsonb_build_object('tickets', q.n, 'extra', extra);
  end if;
end $$;

revoke execute on function public.season_grant(uuid, text), public.season_xp(uuid, text, int, text), public.season_record(uuid, text, date, jsonb, jsonb),
  public.shop_grant(public.shop_quotes, text, bigint) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_referee') then
    grant execute on function public.season_record(uuid, text, date, jsonb, jsonb) to santa_referee;
    grant select on public.seasons to santa_referee;
  end if;
end $$;
