-- 037: the CHRISTMAS season's items (2026-10-03). NOT applied live yet.
-- Five free Christmas looks (colour-only, like 035's Thanksgiving looks) and the CHRISTMAS PASS costume, the Gingerbread (six
-- pieces, one per look slot, like 035's Gobbler). All SEASON items: no unlock level and no price. The free looks are earned by
-- opening the season's doors; the costume is the pass's reward, granted by id into inventory, so save_profile (015,
-- item_usable: level OR owned) lets only an owner wear them, and the shop never sells them (no price; mockups/shoprules.js
-- forSale also refuses any item with a season). Which door gives which item (season_rewards) is NOT in this file.
-- Needs 032 (or 033) first: the season column and the items_check that allows a season item with neither level nor price.
-- mockups/catalog.js is the source; these rows are its copy (tests/db/costumes-db.test.mjs compares every row). Safe to run twice.
insert into public.items (id, slot, name, unlock_level, price_usd, season) values
  ('snow_candycane', 'snow', 'Candy Cane', null, null, 'christmas'),
  ('shirt_peppermint', 'shirt', 'Peppermint', null, null, 'christmas'),
  ('pants_evergreen', 'pants', 'Evergreen', null, null, 'christmas'),
  ('snow_silverflake', 'snow', 'Silver Snowflake', null, null, 'christmas'),
  ('pants_hollyred', 'pants', 'Holly Red', null, null, 'christmas'),
  ('shirt_gingerbread', 'shirt', 'Gumdrop Coat', null, null, 'christmas'),
  ('pants_gingerbread', 'pants', 'Icing Trousers', null, null, 'christmas'),
  ('face_gingerbread', 'face', 'Gingerbread Face', null, null, 'christmas'),
  ('hat_gingerbread', 'hat', 'Icing Cap', null, null, 'christmas'),
  ('pack_gingerbread', 'pack', 'Big Candy Cane', null, null, 'christmas'),
  ('snow_gingerbread', 'snow', 'Peppermint Swirl', null, null, 'christmas')
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level,
  price_usd = excluded.price_usd, season = excluded.season;
