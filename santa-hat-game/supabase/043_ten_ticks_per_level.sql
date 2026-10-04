-- 043: 10 TICKS A LEVEL (Cody, 2026-10-04: "level upgrades should change to 10 ticks, now we give a lot away" — the season track
-- gives level ticks too). A tick = one top-3 finish in a public Auto match, or a season "+1 level tick". Was 5 a level; level 9 → 10
-- stays 10 FIRST-place wins. Mirrors mockups/levels.js (WINS_PER_LEVEL, needFor). Progress already made is kept (an xp of 0–4 is
-- simply further from the next level now). Safe to apply twice.
alter table public.profiles drop constraint if exists profiles_xp_progress;
alter table public.profiles add constraint profiles_xp_progress check (xp >= 0 and xp < 10);
create or replace function public.record_level_finish(p_match text, p_profile uuid, p_place int)
returns table (level int, xp int, up boolean) language plpgsql security definer set search_path = '' as $$
declare pr public.profiles; need int := 10; -- 10 ticks a level (level 9 → 10: 10 first places)
begin
  if p_place not between 1 and 3 then raise exception 'only top-3 finishes count'; end if;
  select * into pr from public.profiles where id = p_profile for update;
  if pr.id is null then raise exception 'unknown player'; end if;
  insert into public.level_finishes (match_id, profile_id, place) values (p_match, p_profile, p_place)
    on conflict do nothing;
  -- already counted, at the top, or not 1st at level 9 (the finish is still recorded, so it can never count twice)
  if not found or pr.level >= 10 or (pr.level = 9 and p_place <> 1) then return query select pr.level, pr.xp, false; return; end if;
  if pr.xp + 1 >= need then
    update public.profiles set level = pr.level + 1, xp = 0, updated_at = now() where id = p_profile;
    return query select pr.level + 1, 0, true;
  else
    update public.profiles set xp = pr.xp + 1, updated_at = now() where id = p_profile;
    return query select pr.level, pr.xp + 1, false;
  end if;
end $$;
