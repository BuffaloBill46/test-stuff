-- APPLIED live 2026-10-02 (checked after: the live items table equals catalog.js, all 74 rows).
-- 028: LOOKS ARE LEVEL REWARDS (Cody, 2026-10-02). Skin tones free; only three faces are sold (Snowman $1.00, Panda $1.50,
-- Gorilla $2.00); every other look unlocks at levels 2, 3, 4, 6, 7, 8 and 9 (3–4 each); levels 5 and 10 each unlock a
-- matching costume (added by its own file). Special snowballs and gear are unchanged (still sold). mockups/catalog.js is the
-- source; these rows are the database's copy, kept equal (the save check uses them: a look is wearable if the player's level
-- reaches its unlock_level, or they own it). Nobody owned any look leaving the Store (checked live). Some level looks moved up
-- a level or two before launch (e.g. Mint 4 → 6). Each row sets both columns at once (an item has a level OR a price: 001).
update public.items i set unlock_level = v.lvl, price_usd = v.price from (values
  ('shirt_gold', 2, null::numeric), ('pants_grey', 2, null), ('face_wink', 2, null), ('snow_ice', 2, null),
  ('shirt_violet', 3, null), ('pants_green', 3, null), ('face_wow', 3, null), ('hat_beanie', 3, null),
  ('shirt_teal', 4, null), ('face_shades', 4, null), ('snow_pink', 4, null), ('pack_satchel', 4, null),
  ('shirt_pink', 6, null), ('pants_red', 6, null), ('hat_earmuffs', 6, null), ('snow_green', 6, null),
  ('shirt_coal', 7, null), ('pants_snow', 7, null), ('face_mask', 7, null), ('pack_gift', 7, null),
  ('shirt_snow', 8, null), ('face_beard', 8, null), ('snow_ember', 8, null), ('hat_tophat', 8, null),
  ('shirt_ember', 9, null), ('pack_sack', 9, null), ('hat_antlers', 9, null),
  ('face_snowman', null::int, 1.00), ('face_panda', null, 1.50), ('face_gorilla', null, 2.00)
) as v(id, lvl, price) where i.id = v.id;
