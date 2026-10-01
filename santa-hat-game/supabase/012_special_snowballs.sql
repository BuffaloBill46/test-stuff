-- NOT APPLIED YET. Special snowballs (Cody, 2026-10-01; mockups/specials.js, catalog.js). Items of slot 'sball' go in the avatar's
-- special snowball slots sb1, sb2, sb3. Without this file, save_profile (008) copies only the 7 look slots and would SILENTLY DROP
-- a player's loadout on save, so it ships with the page that shows the slots. Item rows match mockups/catalog.js (tests/catalog-sql.mjs).

alter table public.items drop constraint items_slot_check;
alter table public.items add constraint items_slot_check check (slot in ('shirt', 'pants', 'face', 'skin', 'hat', 'pack', 'snow', 'sball'));

insert into public.items (id, slot, name, unlock_level, price_usd) values
  ('sb_none', 'sball', 'Empty slot', 1, null),
  ('sb_ice', 'sball', 'Ice Ball', null, 0.50),
  ('sb_split', 'sball', 'Split Ball', null, 0.75),
  ('sb_giant', 'sball', 'Giant Ball', null, 0.75),
  ('sb_fire', 'sball', 'Fire Ball', null, 0.50),
  ('sb_sky', 'sball', 'Sky Ball', null, 1.00),
  ('sb_rain', 'sball', 'Snowball Rain', null, 2.00)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level, price_usd = excluded.price_usd;

-- The colour-slot Ice Ball prototype (snow_iceball) became the Ice Ball special: anyone who owned it owns the special instead,
-- anyone wearing it goes back to the white snowball, and the old item goes.
insert into public.inventory (profile_id, item_id) select profile_id, 'sb_ice' from public.inventory where item_id = 'snow_iceball' on conflict do nothing;
delete from public.inventory where item_id = 'snow_iceball';
update public.profiles set avatar = jsonb_set(avatar, '{snow}', '"snow_white"') where avatar ->> 'snow' = 'snow_iceball';
delete from public.items where id = 'snow_iceball';

-- Same rules as 008's version, plus the special snowball slots: each holds an unlocked special (or 'sb_none'), and the same
-- special can't fill two slots. A page that doesn't send them yet gets empty slots instead of being refused.
create or replace function public.save_profile(p_name text, p_avatar jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.my_profile_id();
  n text := public.clean_name(p_name);
  s text;
  a jsonb;
  clean jsonb := '{}'::jsonb;
  seen text[] := '{}';
  prof public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if pid is null then raise exception 'No profile yet'; end if;
  if char_length(n) < 1 then raise exception 'Name can''t be empty'; end if;
  if jsonb_typeof(p_avatar) is distinct from 'object' then raise exception 'Avatar must be an object'; end if;
  a := jsonb_build_object('hat', 'hat_none', 'pack', 'pack_none', 'sb1', 'sb_none', 'sb2', 'sb_none', 'sb3', 'sb_none') || p_avatar;
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
  update public.profiles set name = n, avatar = clean, updated_at = now() where id = pid returning * into prof;
  return prof;
end $$;
