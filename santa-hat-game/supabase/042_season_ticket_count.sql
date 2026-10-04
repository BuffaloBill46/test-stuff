-- 042: season tickets counted SEPARATELY from bought ones (found by tests/db/full-sim.mjs, 2026-10-04). 039 folded season tickets
-- into ticket_status's `extra`, which the Store also reads to work out how many more a player may BUY (server/shop.js: 10 −
-- extra): with door 1 now giving everyone a ticket (041), buyers could no longer buy their full 10. `extra` is bought tickets
-- again; season_tickets(profile) gives the season bank, and the page adds the two only to show the total. Safe to apply twice.
create or replace function public.ticket_status(p_profile uuid, p_now timestamptz default now())
returns table (free_left int, extra int, held int, resets_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; h int;
begin
  t := public.tickets_row(p_profile, p_now);
  select count(*)::int into h from public.ticket_holds where profile_id = p_profile and state = 'held';
  return query select 10 - t.free_used, t.extra, h, public.game_day_next(p_now);
end $$;
create or replace function public.season_tickets(p_profile uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select season_extra from public.tickets where profile_id = p_profile), 0)
$$;
revoke execute on function public.season_tickets(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_games') then grant execute on function public.season_tickets(uuid) to santa_games; end if;
end $$;
