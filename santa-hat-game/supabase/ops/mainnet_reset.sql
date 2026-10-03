-- MAINNET SWITCH-OVER: clear every TEST (devnet) money record so none of it is ever paid in real SANTA (Cody, launch 2026-10-03).
-- Run ONCE, at GO, after a backup, with the game server and payout worker STOPPED (so nothing is mid-flight), before they
-- start again pointed at mainnet. One transaction: all or nothing. Rehearsed on a copy of the live data first
-- (tests/db/mainnet-reset.test.mjs). Ids keep counting (no restart), so a mainnet payout never shares a number with a test one.
--
-- What must never survive into mainnet, and why:
--   payouts / lottery_payouts / reward_sweeps / shop_refunds : the worker would SEND them, in real SANTA, from the real wallets
--   lottery_draws / lottery_buys                            : a due draw with test tickets would pay a test pot in real SANTA
--   pools.santa_raw                                          : the books must start at 0 and count Cody's real deposit only
--   payments / quotes / runs / plays                         : test plays (and the winners list built from them)
-- Also reset for a fair start: everything test purchases granted (items, levels, extra tickets), and the test matches'
-- standings (levels from finishes, rank points, match stats). Kept: accounts and their logins, the item catalogue, settings
-- (lottery payout mode, alerts), tester feedback, speed-limit counters.
begin;

truncate table
  public.payouts, public.plays, public.runs, public.payments, public.quotes,
  public.pool_transfers, public.pool_log, public.price_samples,
  public.lottery_payouts, public.lottery_buys, public.lottery_quotes, public.lottery_draws,
  public.shop_refunds, public.shop_quotes, public.item_purchases, public.level_purchases, public.ticket_purchases, public.ticket_holds,
  public.reward_sweeps, public.reward_claims,
  public.inventory, public.tickets, public.gear_wear,
  public.match_results, public.level_finishes, public.ranked_results,
  public.alerts_sent;

update public.pools set santa_raw = 0, treasury_net_raw = 0, updated_at = now();
update public.profiles set level = 1, xp = 0, rank_points = 0, updated_at = now();

-- the checks: anything left that could pay out, or a book that isn't zero, aborts the whole switch-over
do $$
declare n bigint;
begin
  select (select count(*) from public.payouts) + (select count(*) from public.lottery_payouts) + (select count(*) from public.reward_sweeps)
       + (select count(*) from public.shop_refunds) + (select count(*) from public.lottery_draws) + (select count(*) from public.lottery_buys)
       + (select count(*) from public.runs) + (select count(*) from public.plays) + (select count(*) from public.payments) into n;
  if n <> 0 then raise exception 'mainnet reset: % test rows left that could pay out', n; end if;
  if exists (select 1 from public.pools where santa_raw <> 0 or treasury_net_raw <> 0) then raise exception 'mainnet reset: a pool book is not zero'; end if;
  if exists (select 1 from public.profiles where level <> 1 or xp <> 0 or rank_points <> 0) then raise exception 'mainnet reset: a profile kept test progress'; end if;
end $$;

commit;
