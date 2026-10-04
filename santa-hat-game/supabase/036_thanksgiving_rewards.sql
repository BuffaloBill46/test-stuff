-- 036: THANKSGIVING's door rewards (mockups/seasons.js is the source; tests/db/seasons-db.test.mjs checks they agree).
-- Free track: the 5 autumn looks on doors 2, 5, 9, 14, 20 (supabase/035 makes the items), a step of level progress on every
-- other door (30 doors: November). Gold track (the $5 pass): The Gobbler, one piece every 3 doors (3 … 18). Same shape as
-- Halloween's rows in 033. Needs 033 and 035. Safe to run twice.
delete from public.season_rewards where season = 'thanksgiving';
insert into public.season_rewards (season, door, track, item_id, xp)
  select 'thanksgiving', d, 'free', case d when 2 then 'snow_cranberry' when 5 then 'shirt_pumpkinpie' when 9 then 'pants_harvestgold' when 14 then 'snow_mapleleaf' when 20 then 'shirt_cornhusk' end,
    case when d in (2, 5, 9, 14, 20) then null else 1 end
  from generate_series(1, 30) d;
insert into public.season_rewards (season, door, track, item_id)
  select 'thanksgiving', g.door, 'gold', g.item from (values (3, 'face_gobbler'), (6, 'hat_gobbler'), (9, 'shirt_gobbler'), (12, 'pants_gobbler'), (15, 'pack_gobbler'), (18, 'snow_gobbler')) g(door, item)
  where exists (select 1 from public.items i where i.id = g.item);
