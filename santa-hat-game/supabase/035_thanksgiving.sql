-- 035: the THANKSGIVING season's items (2026-10-03). NOT applied live yet.
-- Five free Thanksgiving looks (colour-only, like 033's Halloween looks) and the THANKSGIVING PASS costume, the Gobbler (six
-- pieces, one per look slot, like 032's Pumpkin King). All SEASON items: no unlock level and no price. The free looks are
-- earned by opening the season's doors; the costume is the pass's reward, granted by id into inventory, so save_profile (015,
-- item_usable: level OR owned) lets only an owner wear them, and the shop never sells them (no price; mockups/shoprules.js
-- forSale also refuses any item with a season). Which door gives which item (season_rewards) is NOT in this file.
-- Needs 032 (or 033) first: the season column and the items_check that allows a season item with neither level nor price.
-- mockups/catalog.js is the source; these rows are its copy (tests/db/costumes-db.test.mjs compares every row). Safe to run twice.
insert into public.items (id, slot, name, unlock_level, price_usd, season) values
  ('snow_cranberry', 'snow', 'Cranberry', null, null, 'thanksgiving'),
  ('shirt_pumpkinpie', 'shirt', 'Pumpkin Pie', null, null, 'thanksgiving'),
  ('pants_harvestgold', 'pants', 'Harvest Gold', null, null, 'thanksgiving'),
  ('snow_mapleleaf', 'snow', 'Maple Leaf', null, null, 'thanksgiving'),
  ('shirt_cornhusk', 'shirt', 'Corn Husk', null, null, 'thanksgiving'),
  ('shirt_gobbler', 'shirt', 'Feather Coat', null, null, 'thanksgiving'),
  ('pants_gobbler', 'pants', 'Drumstick Trousers', null, null, 'thanksgiving'),
  ('face_gobbler', 'face', 'Gobbler', null, null, 'thanksgiving'),
  ('hat_gobbler', 'hat', 'Pilgrim Hat', null, null, 'thanksgiving'),
  ('pack_gobbler', 'pack', 'Tail Fan', null, null, 'thanksgiving'),
  ('snow_gobbler', 'snow', 'Cranberry Glow', null, null, 'thanksgiving')
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level,
  price_usd = excluded.price_usd, season = excluded.season;
