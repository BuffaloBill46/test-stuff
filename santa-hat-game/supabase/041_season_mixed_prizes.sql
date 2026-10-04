-- 041: ONE MIXED PRIZE A DOOR FOR EVERYONE; THE PASS IS JUST THE COSTUME (Cody, 2026-10-04: "do 1 main reward for everyone mixed.
-- The season bonus is the costume at certain doors"; fewer level ticks, "giving all those free level ticks they max level quick").
-- Mirrors mockups/seasons.js freeReward / goldReward (tests/db/seasons-db.test.mjs checks they agree). Grants (039 season_grant)
-- are unchanged: each reward once, by primary key. Safe to apply twice.
--   Everyone, 30 doors: 5 season looks (each season's own doors), Elf Hat (15) and I.C.E. Kevlar Vest (30), 8 level ticks
--   (3, 7, 11, 17, 21, 24, 27, 29), a ranked ticket (the season bank) on the other 15. The pass: a costume piece on 2, 6, 10, 14, 18, 22.
delete from public.season_rewards where season in ('halloween', 'thanksgiving', 'christmas');
insert into public.season_rewards (season, door, track, item_id, xp, tickets)
  select f.season, d, 'free',
    coalesce(f.look, case d when 15 then 'gear_elfhat' when 30 then 'gear_kevlar' end),
    case when f.look is null and d = any(array[3, 7, 11, 17, 21, 24, 27, 29]) then 1 end,
    case when f.look is null and not (d = any(array[15, 30, 3, 7, 11, 17, 21, 24, 27, 29])) then 1 end
  from generate_series(1, 30) d
  cross join lateral (select s.season, (s.looks ->> d::text) as look from (values
    ('halloween', '{"2":"snow_candycorn","5":"shirt_jackolantern","9":"pants_midnight","14":"snow_ghostly","20":"pants_pumpkin"}'::jsonb),
    ('thanksgiving', '{"2":"snow_cranberry","5":"shirt_pumpkinpie","9":"pants_harvestgold","14":"snow_mapleleaf","20":"shirt_cornhusk"}'::jsonb),
    ('christmas', '{"2":"snow_candycane","5":"shirt_peppermint","9":"pants_evergreen","14":"snow_silverflake","20":"pants_hollyred"}'::jsonb)
  ) s(season, looks)) f;
insert into public.season_rewards (season, door, track, item_id)
  select c.season, x.door, 'gold', c.pieces[x.k]
  from unnest(array[2, 6, 10, 14, 18, 22]) with ordinality x(door, k)
  cross join (values
    ('halloween', array['face_pumpkinking', 'hat_pumpkinking', 'shirt_pumpkinking', 'pants_pumpkinking', 'pack_pumpkinking', 'snow_pumpkinking']),
    ('thanksgiving', array['face_gobbler', 'hat_gobbler', 'shirt_gobbler', 'pants_gobbler', 'pack_gobbler', 'snow_gobbler']),
    ('christmas', array['face_gingerbread', 'hat_gingerbread', 'shirt_gingerbread', 'pants_gingerbread', 'pack_gingerbread', 'snow_gingerbread'])
  ) c(season, pieces);
