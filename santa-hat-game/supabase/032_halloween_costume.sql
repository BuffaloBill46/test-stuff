-- 032: the HALLOWEEN PASS costume, the Pumpkin King (2026-10-03), and the Pumpkin Costume gear retired. NOT applied live yet.
-- Six new look items, one per look slot (shirt, pants, face, hat, pack, snow), like 029's Nutcracker and Frost King, but a
-- SEASON costume: no unlock level and no price. They're the Halloween season pass's reward, granted by id into inventory, so
-- save_profile (015, item_usable: level OR owned) lets only an owner wear them, and the shop never sells them (no price;
-- mockups/shoprules.js forSale also refuses any item with a season).
-- items_check said every item has exactly one of a level or a price; a season item has neither, so the check is rebuilt to
-- allow that for season items only (an item with a season can't also have a level or a price).
-- The Pumpkin Costume gear (gear_pumpkin) is RETIRED in the game code (mockups/gear.js RETIRED, like the Heated Coat): not
-- worn in matches, not listed, not sold (forSale). Its row is NOT touched here: players own it, so it stays, and it keeps its
-- price, like the live price sheet (023). Its jack-o'-lantern head lives on as the Pumpkin King's face.
-- mockups/catalog.js is the source; these rows are its copy (tests/db/costumes-db.test.mjs compares every row). Safe to run twice.
alter table public.items add column if not exists season text;
alter table public.items drop constraint if exists items_check;
alter table public.items add constraint items_check check (
  (season is not null and unlock_level is null and price_usd is null)
  or (season is null and ((unlock_level is null) <> (price_usd is null))));

insert into public.items (id, slot, name, unlock_level, price_usd, season) values
  ('shirt_pumpkinking', 'shirt', 'Patchwork Coat', null, null, 'halloween'),
  ('pants_pumpkinking', 'pants', 'Vine Trousers', null, null, 'halloween'),
  ('face_pumpkinking', 'face', 'Pumpkin King', null, null, 'halloween'),
  ('hat_pumpkinking', 'hat', 'Crooked Hat', null, null, 'halloween'),
  ('pack_pumpkinking', 'pack', 'Jack Lantern', null, null, 'halloween'),
  ('snow_pumpkinking', 'snow', 'Lantern Glow', null, null, 'halloween')
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level,
  price_usd = excluded.price_usd, season = excluded.season;
