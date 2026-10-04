-- 038: CHRISTMAS's door rewards (mockups/seasons.js is the source; tests/db/seasons-db.test.mjs checks they agree).
-- Free track: the 5 festive looks on doors 2, 5, 9, 14, 20 (supabase/037 makes the items), a step of level progress on every
-- other door (32 doors: December 1 to New Year's Day). Gold track (the $5 pass): Gingerbread, one piece every 3 doors (3 … 18).
-- Needs 033 and 037. Safe to run twice.
delete from public.season_rewards where season = 'christmas';
insert into public.season_rewards (season, door, track, item_id, xp)
  select 'christmas', d, 'free', case d when 2 then 'snow_candycane' when 5 then 'shirt_peppermint' when 9 then 'pants_evergreen' when 14 then 'snow_silverflake' when 20 then 'pants_hollyred' end,
    case when d in (2, 5, 9, 14, 20) then null else 1 end
  from generate_series(1, 32) d;
insert into public.season_rewards (season, door, track, item_id)
  select 'christmas', g.door, 'gold', g.item from (values (3, 'face_gingerbread'), (6, 'hat_gingerbread'), (9, 'shirt_gingerbread'), (12, 'pants_gingerbread'), (15, 'pack_gingerbread'), (18, 'snow_gingerbread')) g(door, item)
  where exists (select 1 from public.items i where i.id = g.item);
