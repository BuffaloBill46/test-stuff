-- 029: COSTUMES (Cody, 2026-10-02: "make a special level 5 and a level 10 costume, build 1 for each slot that matches itself for
-- each level. Make them stand out and different from everything else. They will be free."). NOT APPLIED yet: apply it when the
-- page that draws them is published (and the match server runs the same catalog.js); a page that doesn't know an item draws
-- that slot plain, so nothing breaks either way.
-- Twelve new look items, one per look slot (shirt, pants, face, hat, pack, snow; skin tones stay free and aren't costume
-- pieces), all FREE: unlocked by level, no price. Level 5: the Nutcracker Soldier. Level 10: the Frost King.
-- mockups/catalog.js is the source; these rows are its copy (tests/catalog-sql.mjs prints the full seed; tests/db/costumes-db
-- compares every row). save_profile (015) already checks every look slot against unlock_level or ownership, so nothing else
-- changes: a level-4 player's save with a Nutcracker piece is refused, a level-5 player's goes through. Safe to run twice.
-- (The Nutcracker's gold snowball is a NEW item, snow_nutcracker; the old gold snowball "Gilded" (snow_gold) stays removed: 010.)
insert into public.items (id, slot, name, unlock_level, price_usd) values
  ('shirt_nutcracker', 'shirt', 'Nutcracker Coat', 5, null),
  ('pants_nutcracker', 'pants', 'Nutcracker Trousers', 5, null),
  ('face_nutcracker', 'face', 'Nutcracker', 5, null),
  ('hat_nutcracker', 'hat', 'Nutcracker Shako', 5, null),
  ('pack_drum', 'pack', 'Toy Drum', 5, null),
  ('snow_nutcracker', 'snow', 'Nutcracker Gold', 5, null),
  ('shirt_frostking', 'shirt', 'Frost King Robe', 10, null),
  ('pants_frostking', 'pants', 'Frost King Trousers', 10, null),
  ('face_frostking', 'face', 'Frost King', 10, null),
  ('hat_icecrown', 'hat', 'Ice Crown', 10, null),
  ('pack_icewings', 'pack', 'Ice Wings', 10, null),
  ('snow_crystal', 'snow', 'Crystal', 10, null)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, unlock_level = excluded.unlock_level, price_usd = excluded.price_usd;
