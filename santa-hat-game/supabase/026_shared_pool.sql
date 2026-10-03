-- APPLIED live 2026-10-03 (nothing in flight first: no unsettled Big Hat plays, payouts or transfers; checked after: all three route to spin only). ONE GAME POOL (Cody, 2026-10-02): Big Hat ('big'), Snowball Drop ('drop') and Stocking Stuffer ('stocking')
-- all pay into and out of ONE shared pool, the existing 'spin' row (shown to players as "Game pool"). Until now 005's
-- buy_run / settle_play / refund_play sent kind 'big' to the 'slots' row and every other kind to 'spin'. This file makes
-- every kind use 'spin'. Nothing else changes: same function names, arguments, results and rights.
--   * The old 'slots' row (its SANTA, rules and history) is left exactly as it is: moving its money and books into the shared
--     pool is a separate, deliberate step (done by hand on devnet; see HANDOFF). No game routes to it after this file.
--   * finish_run never named a pool (one payout per run, from the run's own plays), so it is unchanged.
--   * pool_transfers rows (skims, top-offs) made by settle_play now say game 'spin' for Big Hat plays too.
-- Idempotent: create or replace, and the rights are set again the same way 005 set them. Safe to run twice.
-- BEFORE applying on a live project: stop both pools (emergency stop on the admin screen) and wait out any quote (60 s), so no
-- Big Hat payment is in flight to the old Slots wallet while the server switches (the page is told the wallet in the quote).

-- Step 1 of the order: the confirmed payment buys a run, and its n plays are made ('spent': no secret yet).
create or replace function public.buy_run(p_quote uuid, p_signature text, p_paid bigint, p_burned bigint, p_arrived bigint, p_version int default 0)
returns bigint language plpgsql security definer set search_path = '' as $$
declare q public.quotes; rid bigint; next_no bigint;
begin
  select * into q from public.quotes where id = p_quote for update;
  if q.id is null then raise exception 'unknown quote'; end if;
  if q.used_by is not null then raise exception 'quote already used'; end if;
  perform pg_advisory_xact_lock(hashtext(q.profile_id::text));
  insert into public.payments (signature, quote_id, profile_id, kind, n, paid_raw, burned_raw, arrived_raw)
    values (p_signature, q.id, q.profile_id, q.kind, q.n, p_paid, p_burned, p_arrived);  -- a reused signature fails here
  update public.quotes set used_by = p_signature where id = q.id;
  insert into public.runs (profile_id, signature, kind, n, bet, settings_version) values (q.profile_id, p_signature, q.kind, q.n, q.bet, p_version) returning id into rid;
  select coalesce(max(play_no), 0) into next_no from public.plays where profile_id = q.profile_id;
  insert into public.plays (profile_id, run_id, kind, play_no, bet, settings_version)
    select q.profile_id, rid, q.kind, next_no + i, q.bet, p_version from generate_series(1, q.n) as i;
  -- the SANTA that arrived reaches the shared Game pool now (every game, Cody 2026-10-02)
  update public.pools set santa_raw = santa_raw + p_arrived, updated_at = now() where game = 'spin';
  return rid;
end $$;

-- Steps 3–4: record the result (the server ran the game rules) and update the shared Game pool. The prize is SENT with the run.
create or replace function public.settle_play(p_play bigint, p_seed text, p_result jsonb, p_pay numeric, p_pay_raw bigint, p_price numeric,
  p_pool_delta_raw bigint, p_treasury_delta_raw bigint, p_to_wallet text, p_cap numeric, p_skim_raw bigint default 0, p_top_raw bigint default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare pl public.plays;
begin
  update public.plays set state = 'settled', player_seed = p_seed, result = p_result, pay = p_pay, pay_raw = p_pay_raw, price_usd = p_price, settled_at = now()
    where id = p_play and state = 'open' returning * into pl;
  if pl.id is null then raise exception 'play % is not open', p_play; end if;
  update public.pools set santa_raw = santa_raw + p_pool_delta_raw, treasury_net_raw = treasury_net_raw + p_treasury_delta_raw, updated_at = now()
    where game = 'spin';
  if p_skim_raw > 0 then insert into public.pool_transfers (play_id, game, kind, amount_raw) values (pl.id, 'spin', 'skim', p_skim_raw); end if;
  if p_top_raw > 0 then insert into public.pool_transfers (play_id, game, kind, amount_raw, status) values (pl.id, 'spin', 'top-off', p_top_raw, 'needs_approval'); end if;
end $$;

-- The pool refused the play (emergency stop) or something failed before a result existed: its price goes back to the player
-- with the run, paid by the shared Game pool (where its entry went).
create or replace function public.refund_play(p_play bigint, p_refund_raw bigint default 0, p_price numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare pl public.plays;
begin
  update public.plays set state = 'refunded', pay = bet, pay_raw = p_refund_raw, price_usd = p_price, settled_at = now()
    where id = p_play and state in ('spent', 'open') returning * into pl;
  if pl.id is null then raise exception 'play % cannot be refunded', p_play; end if;
  update public.pools set santa_raw = santa_raw - p_refund_raw, updated_at = now() where game = 'spin';
end $$;

-- Server-only, exactly as 005 set them (create or replace keeps a function's rights; set again so a fresh copy matches too).
revoke execute on function public.buy_run, public.settle_play, public.refund_play from public, anon, authenticated;
