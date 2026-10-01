-- NOT APPLIED YET. Avatar Hats and Backpacks (Cody, 2026-10-01), and the first special snowball (Ice Ball: stuns 50% longer;
-- its rule lives in mockups/catalog.js, the match referee applies it). Apply BEFORE publishing the page that shows them:
-- until then, saving an avatar with a hat or backpack is refused. Item rows match mockups/catalog.js (tests/catalog-sql.mjs).
alter table public.items drop constraint items_slot_check;
alter table public.items add constraint items_slot_check check (slot in ('shirt', 'pants', 'face', 'skin', 'hat', 'pack', 'snow'));

insert into public.items (id, slot, name, unlock_level, price_usd) values
  ('snow_iceball', 'snow', 'Ice Ball', 4, null),
  ('hat_none', 'hat', 'No hat', 1, null),
  ('hat_beanie', 'hat', 'Knit Beanie', 1, null),
  ('hat_earmuffs', 'hat', 'Earmuffs', 2, null),
  ('hat_antlers', 'hat', 'Reindeer Antlers', 4, null),
  ('hat_tophat', 'hat', 'Snowman Top Hat', null, 0.25),
  ('pack_none', 'pack', 'No backpack', 1, null),
  ('pack_satchel', 'pack', 'Elf Satchel', 2, null),
  ('pack_sack', 'pack', 'Toy Sack', 3, null),
  ('pack_gift', 'pack', 'Gift Box', null, 0.25)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level, price_usd = excluded.price_usd;

-- Same rules as 004's version, now 7 slots. A page that doesn't send a hat or backpack yet (the live one, until it's
-- republished) gets "none" for them instead of being refused.
create or replace function public.save_profile(p_name text, p_avatar jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.my_profile_id();
  n text := public.clean_name(p_name);
  s text;
  a jsonb;
  clean jsonb := '{}'::jsonb;
  prof public.profiles;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if pid is null then raise exception 'No profile yet'; end if;
  if char_length(n) < 1 then raise exception 'Name can''t be empty'; end if;
  if jsonb_typeof(p_avatar) is distinct from 'object' then raise exception 'Avatar must be an object'; end if;
  a := jsonb_build_object('hat', 'hat_none', 'pack', 'pack_none') || p_avatar;
  foreach s in array array['shirt', 'pants', 'face', 'skin', 'hat', 'pack', 'snow'] loop
    if not public.item_usable(pid, a ->> s, s) then
      raise exception 'Item "%" isn''t unlocked for %', coalesce(a ->> s, 'none'), s;
    end if;
    clean := clean || jsonb_build_object(s, a ->> s);
  end loop;
  update public.profiles set name = n, avatar = clean, updated_at = now() where id = pid returning * into prof;
  return prof;
end $$;
