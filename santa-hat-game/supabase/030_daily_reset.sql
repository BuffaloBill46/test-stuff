-- APPLIED live 2026-10-03 (checked: day start, next reset and week start correct now; the match server can still hold tickets, visitors cannot read ticket status).
-- 030: EVERY DAILY RESET AT 9 PM INDIANA TIME (Cody, 2026-10-02: "for all game resets, like rank tickets or anything else on a
-- timer, it resets at 9pm indiana time"). The game day runs from 9 PM to 9 PM in America/Indiana/Indianapolis (Eastern time
-- with daylight saving), the same moment for every player, matching the weekly lottery draw (Sunday 9 PM; mockups/lottery.js).
-- Before: each player's free ranked tickets came back 24 hours after THEIR clock started, and the 10-bought limit was a rolling
-- 24 hours. Now both reset for everyone at 9 PM Indiana time. mockups/gameclock.js has the same rules for the page.
--   game_day_start(t): the most recent 9 PM Indiana time at or before t     game_day_next(t): the next one after t
--   game_week_start(t): the most recent Sunday 9 PM Indiana time at or before t (the Ranks "This week" board)
-- 9 PM always exists in that zone (clocks change at 2 AM), so these are exact on the clock-change days too.
create or replace function public.game_day_start(p_t timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((date_trunc('day', (p_t at time zone 'America/Indiana/Indianapolis') - interval '21 hours') + interval '21 hours')
    at time zone 'America/Indiana/Indianapolis')
$$;
create or replace function public.game_day_next(p_t timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((date_trunc('day', (p_t at time zone 'America/Indiana/Indianapolis') - interval '21 hours') + interval '1 day 21 hours')
    at time zone 'America/Indiana/Indianapolis')
$$;
create or replace function public.game_week_start(p_t timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((date_trunc('day', (p_t at time zone 'America/Indiana/Indianapolis') - interval '21 hours')
      - make_interval(days => extract(dow from (p_t at time zone 'America/Indiana/Indianapolis') - interval '21 hours')::int) + interval '21 hours')
    at time zone 'America/Indiana/Indianapolis')
$$;

-- The player's row, with the free tickets back to 10 if a 9 PM reset has passed since they were last counted.
create or replace function public.tickets_row(p_profile uuid, p_now timestamptz) returns public.tickets
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; d timestamptz := public.game_day_start(p_now);
begin
  insert into public.tickets (profile_id, window_start) values (p_profile, d) on conflict do nothing;
  select * into t from public.tickets where profile_id = p_profile for update;
  if t.window_start < d then
    update public.tickets set free_used = 0, window_start = d where profile_id = p_profile returning * into t;
  end if;
  return t;
end $$;

-- What the player can see: free left today, extra, and when the free ones come back (the next 9 PM Indiana time).
create or replace function public.ticket_status(p_profile uuid, p_now timestamptz default now())
returns table (free_left int, extra int, held int, resets_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; h int;
begin
  t := public.tickets_row(p_profile, p_now);
  select count(*)::int into h from public.ticket_holds where profile_id = p_profile and state = 'held';
  return query select 10 - t.free_used, t.extra, h, public.game_day_next(p_now);
end $$;

-- Extra tickets from a confirmed payment: at most 10 bought per game day (resets 9 PM Indiana time) and at most 10 bought
-- held at once (022). Same signature, so shop_buy (016) keeps calling it.
create or replace function public.buy_tickets(p_profile uuid, p_n int, p_signature text, p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare recent int; t public.tickets;
begin
  t := public.tickets_row(p_profile, p_now);
  select coalesce(sum(n), 0)::int into recent from public.ticket_purchases where profile_id = p_profile and at >= public.game_day_start(p_now);
  if recent + p_n > 10 then raise exception 'at most 10 extra tickets a day, resetting at 9 PM Indiana time (% left)', 10 - recent; end if;
  if t.extra + p_n > 10 then raise exception 'you can hold at most 10 bought ranked tickets; room for % more', greatest(0, 10 - t.extra); end if;
  insert into public.ticket_purchases (signature, profile_id, n, at) values (p_signature, p_profile, p_n, p_now);
  update public.tickets set extra = extra + p_n where profile_id = p_profile returning * into t;
  return t.extra;
end $$;

revoke execute on function public.tickets_row, public.ticket_status, public.buy_tickets from public, anon, authenticated;
grant execute on function public.game_day_start, public.game_day_next, public.game_week_start to anon, authenticated;
