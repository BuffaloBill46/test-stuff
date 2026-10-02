-- NOT APPLIED YET. Special gear (Cody, 2026-10-01; mockups/gear.js, catalog.js; DESIGN_NOTES → "Levels, special snowballs and
-- special gear"). Items of slot 'gear' go in the avatar's gear slots g1, g2 (g2 opens at level 8: levels.js). Gear WEARS OUT: a
-- 7-day clock starts at the first match wearing it and never stops (gear_wear below). Without this file, save_profile (012)
-- copies only the look and special snowball slots and would SILENTLY DROP a player's gear on save, so it ships with the page
-- that shows the Special Gear slots. Item rows match mockups/catalog.js (tests/catalog-sql.mjs; tests/db/gear-db.test.mjs).
-- Needs 004 (my_profile_id), 008 and 012 applied first.

alter table public.items drop constraint items_slot_check;
alter table public.items add constraint items_slot_check check (slot in ('shirt', 'pants', 'face', 'skin', 'hat', 'pack', 'snow', 'sball', 'gear'));

-- Prices are Claude's placeholders (Cody: "set a base price, we will change later").
insert into public.items (id, slot, name, unlock_level, price_usd) values
  ('gear_none', 'gear', 'Empty slot', 1, null),
  ('gear_pumpkin', 'gear', 'Pumpkin Costume', null, 0.50),
  ('gear_kevlar', 'gear', 'I.C.E. Kevlar Vest', null, 0.50),
  ('gear_heated', 'gear', 'Heated Coat', null, 0.50),
  ('gear_santa', 'gear', 'Santa Costume', null, 1.00),
  ('gear_gift', 'gear', 'Gift Box', null, 0.50),
  ('gear_sack', 'gear', 'Toy Sack', null, 0.75),
  ('gear_satchel', 'gear', 'Elf Satchel', null, 0.50),
  ('gear_shoes', 'gear', 'Elf Shoes', null, 0.75),
  ('gear_elfhat', 'gear', 'Elf Hat', null, 0.50),
  ('gear_backpack', 'gear', 'Backpack', null, 0.50)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level, price_usd = excluded.price_usd;

-- Cody: existing items become gear and keep their names (Toy Sack = Santa Bag, Gift Box = Present Box, Elf Satchel). The
-- backpacks were bought as looks that last forever and the character still draws them, so they STAY (owned, worn, sold);
-- every owner ALSO gets the matching gear. Nobody is moved: putting it in a gear slot for them would start its 7-day clock at
-- their next match without them choosing to. (Unlike 012's Ice Ball, nothing is deleted here.)
insert into public.inventory (profile_id, item_id)
  select profile_id, case item_id when 'pack_sack' then 'gear_sack' when 'pack_gift' then 'gear_gift' else 'gear_satchel' end
  from public.inventory where item_id in ('pack_sack', 'pack_gift', 'pack_satchel')
on conflict do nothing;

-- The 7-day clock: one row per (player, gear item), written by the server the first time that gear is worn in a match, never
-- changed after. Players can read their own (to show "3 days left"); nobody but the server writes. Supabase grants anon and
-- signed-in users ALL on new tables, so everything is revoked first (LESSONS: the test database must have the live grants).
-- NOT BUILT: buying the same gear again after it wore out. Whatever sells gear must delete that row (a fresh 7 days); today
-- nothing sells items through the database, and the inventory row (owned) simply stays.
create table public.gear_wear (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.items (id),
  first_worn_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);
alter table public.gear_wear enable row level security;
revoke all on public.gear_wear from anon, authenticated;
grant select on public.gear_wear to authenticated;
create policy gear_wear_read_own on public.gear_wear for select using (profile_id = (select public.my_profile_id()));

-- The server, when a match starts (or at the latest when it ends), for each player with an account: the gear ITEMS in their
-- open gear slots (a Present Box's clock is the Gift Box's, whatever it turned into). Starts each one's clock once; worn again
-- later changes nothing. Only owned gear items count. Returns how many clocks were started now.
create function public.record_gear_worn(p_profile uuid, p_items text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.gear_wear (profile_id, item_id)
    select p_profile, inv.item_id from public.inventory inv join public.items it on it.id = inv.item_id
    where inv.profile_id = p_profile and it.slot = 'gear' and it.id <> 'gear_none' and inv.item_id = any (p_items)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Worn out: 7 days (gear.js WEAR_DAYS) after the first match wearing it. Never worn = not worn out.
create function public.gear_worn_out(p_profile uuid, p_item text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gear_wear w where w.profile_id = p_profile and w.item_id = p_item and w.first_worn_at <= now() - interval '7 days')
$$;

-- Matches are refereed in the host's browser from saved avatars, which can't see the clock. So the server takes worn-out gear
-- off every saved avatar (run it before matches start, or on a schedule): the slot becomes empty. Returns how many changed.
create function public.take_off_worn_gear() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.profiles p set avatar = p.avatar
      || case when public.gear_worn_out(p.id, p.avatar ->> 'g1') then '{"g1": "gear_none"}'::jsonb else '{}'::jsonb end
      || case when public.gear_worn_out(p.id, p.avatar ->> 'g2') then '{"g2": "gear_none"}'::jsonb else '{}'::jsonb end,
    updated_at = now()
  where public.gear_worn_out(p.id, p.avatar ->> 'g1') or public.gear_worn_out(p.id, p.avatar ->> 'g2');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.record_gear_worn(uuid, text[]), public.gear_worn_out(uuid, text), public.take_off_worn_gear() from public, anon, authenticated;

-- NO STACKING (Cody, 2026-10-01: "Can't stack same stat"): each gear item boosts one stat (mockups/gear.js `stat`; the Gift
-- Box / Present Box has none of its own). save_profile refuses two gear with the same stat. tests/db/gear-db.test.mjs checks this
-- list matches gear.js.
create function public.gear_stat(p_item text) returns text
language sql immutable set search_path = '' as $$
  select case p_item when 'gear_pumpkin' then 'hits' when 'gear_kevlar' then 'hits' when 'gear_heated' then 'hits' when 'gear_santa' then 'hits'
    when 'gear_sack' then 'held' when 'gear_backpack' then 'held' when 'gear_satchel' then 'refill' when 'gear_shoes' then 'speed'
    when 'gear_elfhat' then 'size' else null end
$$;

-- Same rules as 012's version, plus the gear slots: each holds an owned gear item (or 'gear_none'), the same gear can't fill
-- both, the 2nd slot only from level 8, the Santa Costume only from level 3 (gear.js). WORN-OUT gear is taken off (the slot
-- saves as empty) instead of refusing the save: it wore out on its own, so refusing would block every other change (name,
-- shirt) until the player removed it by hand; the returned profile shows the empty slot. A page that doesn't send the gear
-- slots yet gets empty slots instead of being refused.
create or replace function public.save_profile(p_name text, p_avatar jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.my_profile_id();
  n text := public.clean_name(p_name);
  s text;
  a jsonb;
  clean jsonb := '{}'::jsonb;
  seen text[] := '{}';
  stats text[] := '{}';
  lvl int;
  prof public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if pid is null then raise exception 'No profile yet'; end if;
  if char_length(n) < 1 then raise exception 'Name can''t be empty'; end if;
  if jsonb_typeof(p_avatar) is distinct from 'object' then raise exception 'Avatar must be an object'; end if;
  a := jsonb_build_object('hat', 'hat_none', 'pack', 'pack_none', 'sb1', 'sb_none', 'sb2', 'sb_none', 'sb3', 'sb_none', 'g1', 'gear_none', 'g2', 'gear_none') || p_avatar;
  foreach s in array array['shirt', 'pants', 'face', 'skin', 'hat', 'pack', 'snow'] loop
    if not public.item_usable(pid, a ->> s, s) then
      raise exception 'Item "%" isn''t unlocked for %', coalesce(a ->> s, 'none'), s;
    end if;
    clean := clean || jsonb_build_object(s, a ->> s);
  end loop;
  foreach s in array array['sb1', 'sb2', 'sb3'] loop
    if not public.item_usable(pid, a ->> s, 'sball') then
      raise exception 'Special snowball "%" isn''t unlocked', coalesce(a ->> s, 'none');
    end if;
    if a ->> s <> 'sb_none' and (a ->> s) = any (seen) then raise exception 'The same special snowball can''t fill two slots'; end if;
    seen := seen || (a ->> s);
    clean := clean || jsonb_build_object(s, a ->> s);
  end loop;
  select level into lvl from public.profiles where id = pid;
  foreach s in array array['g1', 'g2'] loop
    if not public.item_usable(pid, a ->> s, 'gear') then
      raise exception 'Gear "%" isn''t unlocked', coalesce(a ->> s, 'none');
    end if;
    if a ->> s <> 'gear_none' then
      if s = 'g2' and lvl < 8 then raise exception 'The second gear slot opens at level 8'; end if;
      if a ->> s = 'gear_santa' and lvl < 3 then raise exception 'The Santa Costume is worn from level 3'; end if;
      if (a ->> s) = any (seen) then raise exception 'The same gear can''t fill two slots'; end if;
      if public.gear_stat(a ->> s) = any (stats) then raise exception 'Two gear can''t boost the same stat'; end if; -- no stacking (Cody)
      if public.gear_worn_out(pid, a ->> s) then a := a || jsonb_build_object(s, 'gear_none'); end if;
      if public.gear_stat(a ->> s) is not null then stats := stats || public.gear_stat(a ->> s); end if;
    end if;
    seen := seen || (a ->> s);
    clean := clean || jsonb_build_object(s, a ->> s);
  end loop;
  update public.profiles set name = n, avatar = clean, updated_at = now() where id = pid returning * into prof;
  return prof;
end $$;
