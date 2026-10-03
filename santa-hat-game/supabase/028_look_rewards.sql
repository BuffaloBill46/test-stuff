-- 028: LOOKS ARE LEVEL REWARDS (Cody, 2026-10-02). Skin tones free; only three faces are sold (Snowman $1.00, Panda $1.50,
-- Gorilla $2.00); every other look is unlocked by level 2–10 (at least 2 per level; the flashiest last). Special snowballs and
-- gear are unchanged (still sold). mockups/catalog.js is the source; these rows are the database's copy, kept equal (the
-- save check uses them: a look is wearable if the player's level reaches its unlock_level, or they own it).
-- Nobody owned any of the looks moving out of the Store when this was written (checked live), and no look moved to a higher
-- level than before, so no one loses anything. Each row sets both columns at once (an item has a level OR a price: 001's check).
update public.items i set unlock_level = v.lvl, price_usd = v.price from (values
  ('shirt_coal', 7, null::numeric), ('shirt_ember', 9, null), ('pants_snow', 7, null), ('face_mask', 8, null), ('snow_ember', 8, null),
  ('hat_beanie', 5, null), ('hat_earmuffs', 6, null), ('hat_antlers', 10, null), ('hat_tophat', 10, null),
  ('pack_satchel', 7, null), ('pack_gift', 8, null), ('pack_sack', 9, null),
  ('face_snowman', null::int, 1.00), ('face_panda', null, 1.50), ('face_gorilla', null, 2.00)
) as v(id, lvl, price) where i.id = v.id;
