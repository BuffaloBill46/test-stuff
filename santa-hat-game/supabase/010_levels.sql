-- NOT APPLIED YET. Levels (Cody, 2026-10-01; rules in mockups/levels.js, DESIGN_NOTES → "Levels, special snowballs and special
-- gear"), and the gold snowball removed (Cody: "remove any yellow or gold colored snowball; we will add one later with a special").
-- profiles.level is the level (1–10); profiles.xp is the progress toward the NEXT level: top-3 Auto match finishes, 0–4
-- (level 9 → 10 is different, Cody 2026-10-01: FIRST-place wins, 0–9).
-- Only the game server (service role) can change either: the website can only read them.

-- 1. Gilded (snow_gold) goes. Anyone using it is moved to the white snowball first, so no saved avatar is refused.
update public.profiles set avatar = jsonb_set(avatar, '{snow}', '"snow_white"') where avatar ->> 'snow' = 'snow_gold';
delete from public.inventory where item_id = 'snow_gold';
delete from public.items where id = 'snow_gold';

-- 2. The level rules, enforced by the database itself.
alter table public.profiles add constraint profiles_level_max check (level <= 10);
alter table public.profiles add constraint profiles_xp_progress check (xp >= 0 and xp < case when level = 9 then 10 else 5 end);

-- 3. A top-3 finish counts once per match per player (a resent or replayed result can't level anyone up twice).
create table public.level_finishes (
  match_id text not null check (char_length(match_id) between 8 and 80),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  place int not null check (place between 1 and 3),
  at timestamptz not null default now(),
  primary key (match_id, profile_id)
);
alter table public.level_finishes enable row level security;
revoke all on public.level_finishes from anon, authenticated;

-- 4. A bought level: one per confirmed payment (the signature), never above level 5.
create table public.level_purchases (
  signature text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  from_level int not null check (from_level between 1 and 4),
  to_level int not null check (to_level = from_level + 1 and to_level <= 5),
  usd numeric(10, 2) not null check (usd = case when to_level = 5 then 5 else 1 end),
  paid_raw bigint not null check (paid_raw > 0),
  at timestamptz not null default now()
);
alter table public.level_purchases enable row level security;
revoke all on public.level_purchases from anon, authenticated;

-- A top-3 finish in an Auto match (the server decides it was one). Returns the new level and progress, and whether it went up.
-- Same rules as mockups/levels.js afterMatch: 5 top-3 finishes per level; level 9 → 10 takes 10 FIRST-place wins; 10 is the top.
create function public.record_level_finish(p_match text, p_profile uuid, p_place int)
returns table (level int, xp int, up boolean) language plpgsql security definer set search_path = '' as $$
declare pr public.profiles; need int;
begin
  if p_place not between 1 and 3 then raise exception 'only top-3 finishes count'; end if;
  select * into pr from public.profiles where id = p_profile for update;
  if pr.id is null then raise exception 'unknown player'; end if;
  insert into public.level_finishes (match_id, profile_id, place) values (p_match, p_profile, p_place)
    on conflict do nothing;
  -- already counted, at the top, or not 1st at level 9 (the finish is still recorded, so it can never count twice)
  if not found or pr.level >= 10 or (pr.level = 9 and p_place <> 1) then return query select pr.level, pr.xp, false; return; end if;
  need := case when pr.level = 9 then 10 else 5 end;
  if pr.xp + 1 >= need then
    update public.profiles set level = pr.level + 1, xp = 0, updated_at = now() where id = p_profile;
    return query select pr.level + 1, 0, true;
  else
    update public.profiles set xp = pr.xp + 1, updated_at = now() where id = p_profile;
    return query select pr.level, pr.xp + 1, false;
  end if;
end $$;

-- A level bought with a confirmed payment (the server checks the payment first). Same rules as levels.js afterBuy:
-- one level per payment, up to level 5, progress toward the next level kept.
-- p_to_level: the level the PRICE was for. A payment only ever buys that level: if the player's level changed after the price
-- was given (another tab, a level earned meanwhile), it's refused, so a $1 price can never buy the $5 level.
create function public.buy_level(p_profile uuid, p_signature text, p_paid_raw bigint, p_to_level int)
returns int language plpgsql security definer set search_path = '' as $$
declare pr public.profiles;
begin
  select * into pr from public.profiles where id = p_profile for update;
  if pr.id is null then raise exception 'unknown player'; end if;
  if pr.level >= 5 then raise exception 'levels above 5 are earned in Auto match games, not bought'; end if;
  if p_to_level is distinct from pr.level + 1 then raise exception 'your level changed since this price was given'; end if;
  insert into public.level_purchases (signature, profile_id, from_level, to_level, usd, paid_raw)
    values (p_signature, p_profile, pr.level, pr.level + 1, case when pr.level + 1 = 5 then 5 else 1 end, p_paid_raw); -- a reused payment fails here
  update public.profiles set level = pr.level + 1, updated_at = now() where id = p_profile;
  return pr.level + 1;
end $$;

revoke execute on function public.record_level_finish, public.buy_level from public, anon, authenticated;
