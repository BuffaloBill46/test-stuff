-- 017: the match referee server's own database login (server/referee.js, worker/referee.mjs on the Droplet), 2026-10-02.
-- Least privilege: it can look up which profile a sign-in belongs to (with that profile's saved level and look) and record
-- an Auto match's finishes. Nothing else: no money tables, no payouts, no writing profiles directly, no other logins.
-- Its PASSWORD is not here (never in the repo): it is set once with a pre-hashed SCRAM verifier (alter role ... password
-- 'SCRAM-SHA-256$...'), so the plain password exists only on the Droplet (/etc/santa/referee.env, readable by root and santa).
-- It connects through Supabase's session pooler as santa_referee.<project ref>.

create role santa_referee login noinherit;
grant usage on schema public to santa_referee;

-- The profile a Supabase user is linked to (004 logins), with what the referee needs: saved level, saved look, name.
-- (The saved look only ever holds items the player owns and has unlocked: 015 save_profile checks that.)
create function public.referee_profile(p_user uuid) returns table (id uuid, level int, avatar jsonb, name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.level, p.avatar, p.name from public.logins l join public.profiles p on p.id = l.profile_id where l.user_id = p_user
$$;
revoke execute on function public.referee_profile(uuid) from public, anon, authenticated;
grant execute on function public.referee_profile(uuid) to santa_referee;

-- Recording a finished Auto match (server/levels.js finishByReferee): stats, level finishes, the special gear clock.
grant execute on function public.record_match_result(text, uuid, int, int), public.record_level_finish(text, uuid, int),
  public.record_gear_worn(uuid, text[]), public.take_off_worn_gear() to santa_referee;
-- levels.js reads each finisher's saved look and level for the gear clock (profiles are public to read anyway: 001).
grant select (id, level, avatar) on public.profiles to santa_referee;
