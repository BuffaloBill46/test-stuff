-- 049: CAREER STATS (Cody, 2026-10-04 to-do #6: "in Player Progress and the Ranked board add thrown / hit / % / SANTA spent /
-- SANTA won"). Each Auto match result now keeps the player's snowballs thrown and hits, from the MATCH SERVER's own counts (a
-- page's report keeps 0: only the referee's are trusted; server/levels.js). career_stats(ids) adds up, per player:
--   thrown, hits                  every Auto match they finished (match_results)
--   spent_raw (SANTA, smallest unit) Arcade runs (payments) + everything paid in the Store (items, levels, tickets, the pass:
--                                 the quotes a payment used) + lottery tickets (lottery_buys). Paid with SOL: its SANTA value.
--   won_raw                       Arcade winnings sent (payouts) + lottery prizes sent (lottery_payouts)
-- Public on purpose (the Ranked board shows them; a wallet's SANTA moves are public on Solana anyway). ranked_board also returns
-- each player's id now, so the Today / This week boards can show the same numbers. Safe to apply twice.
alter table public.match_results add column if not exists thrown int not null default 0 check (thrown between 0 and 5000);
alter table public.match_results add column if not exists hits int not null default 0 check (hits between 0 and 5000);

drop function if exists public.record_match_result(text, uuid, int, int);
create or replace function public.record_match_result(p_match text, p_profile uuid, p_place int, p_players int, p_thrown int default 0, p_hits int default 0) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.match_results (match_id, profile_id, place, players, thrown, hits)
    values (p_match, p_profile, p_place, p_players, least(greatest(coalesce(p_thrown, 0), 0), 5000), least(greatest(coalesce(p_hits, 0), 0), 5000))
    on conflict do nothing;
  return found;
end $$;
revoke execute on function public.record_match_result(text, uuid, int, int, int, int) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'santa_referee') then grant execute on function public.record_match_result(text, uuid, int, int, int, int) to santa_referee; end if;
  if exists (select 1 from pg_roles where rolname = 'santa_games') then grant execute on function public.record_match_result(text, uuid, int, int, int, int) to santa_games; end if;
end $$;

create or replace function public.career_stats(p_ids uuid[]) returns table (profile_id uuid, thrown int, hits int, spent_raw bigint, won_raw bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,
    coalesce((select sum(m.thrown) from public.match_results m where m.profile_id = p.id), 0)::int,
    coalesce((select sum(m.hits) from public.match_results m where m.profile_id = p.id), 0)::int,
    (coalesce((select sum(pa.paid_raw) from public.payments pa where pa.profile_id = p.id), 0)
      + coalesce((select sum(q.santa_raw) from public.shop_quotes q where q.profile_id = p.id and q.used_by is not null), 0)
      + coalesce((select sum(b.paid_raw) from public.lottery_buys b where b.profile_id = p.id), 0))::bigint,
    (coalesce((select sum(po.amount_raw) from public.payouts po join public.runs r on r.id = po.run_id where r.profile_id = p.id and po.status = 'sent'), 0)
      + coalesce((select sum(lp.amount_raw) from public.lottery_payouts lp where lp.profile_id = p.id and lp.status = 'sent'), 0))::bigint
  from public.profiles p where p.id = any (p_ids[1:60])
$$;
revoke execute on function public.career_stats(uuid[]) from public;
grant execute on function public.career_stats(uuid[]) to anon, authenticated;

drop function if exists public.ranked_board(timestamptz);
create function public.ranked_board(p_since timestamptz) returns table (name text, wallet text, level int, points int, matches int, id uuid)
language sql stable security definer set search_path = '' as $$
  select p.name, p.wallet, p.level, sum(r.change)::int, count(*)::int, p.id
  from public.ranked_results r join public.profiles p on p.id = r.profile_id
  where r.at >= greatest(coalesce(p_since, now() - interval '1 day'), now() - interval '8 days')
  group by p.id, p.name, p.wallet, p.level
  order by 4 desc, 5 desc, p.name
  limit 50
$$;
revoke execute on function public.ranked_board(timestamptz) from public;
grant execute on function public.ranked_board(timestamptz) to anon, authenticated;
