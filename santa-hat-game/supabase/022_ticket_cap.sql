-- APPLIED live 2026-10-02 (nobody held bought tickets then; checked after: capped, players can't call it).
-- At most 25 ranked tickets at once (Cody, 2026-10-02: "25 max bc will give away tickets sometimes").
-- 25 = the 10 free a day + at most 10 BOUGHT held (Cody: "I don't want people being able to buy 15") + at most 5 GIVEN by
-- Cody (giveaways, not built yet: their own cap when they are). mockups/ranked.js TICKET_MAX = 25 (the page shows "N / 25"); server/shop.js
-- refuses a quote that would pass it BEFORE anyone pays; this is the backstop at granting (a refusal here inside shop_buy
-- records the payment as owed back in full: 016).
-- Only change from 006: the extra cap line. Same signature, so shop_buy (016) keeps calling it.
create or replace function public.buy_tickets(p_profile uuid, p_n int, p_signature text, p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare recent int; t public.tickets;
begin
  t := public.tickets_row(p_profile, p_now);
  select coalesce(sum(n), 0)::int into recent from public.ticket_purchases where profile_id = p_profile and at > p_now - interval '24 hours';
  if recent + p_n > 10 then raise exception 'at most 10 extra tickets per 24 hours (% left)', 10 - recent; end if;
  if t.extra + p_n > 10 then raise exception 'you can hold at most 10 bought ranked tickets; room for % more', greatest(0, 10 - t.extra); end if;
  insert into public.ticket_purchases (signature, profile_id, n, at) values (p_signature, p_profile, p_n, p_now);
  update public.tickets set extra = extra + p_n where profile_id = p_profile returning * into t;
  return t.extra;
end $$;

revoke execute on function public.buy_tickets from public, anon, authenticated;
