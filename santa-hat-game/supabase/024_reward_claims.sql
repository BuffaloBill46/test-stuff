-- 024: CLAIM REWARDS (Cody, 2026-10-02): reward tokens sent to SANTA holders (GP HTmQz7My6MehV7bjhJ6jde8nDND1yvsz68d24LP7YgUQ,
-- GLDX Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re, and any later one) land in the pool wallets, which hold SANTA. Cody presses
-- "Claim rewards" on the admin screen (a signed admin message: server/admin.js 'claim-rewards'); the payout worker on the
-- Droplet (it holds the pool keys) reads each pool's token balances and sends every NON-SANTA token to the TREASURY, with the
-- same never-pay-twice sending as winnings (server/payouts.js on table reward_sweeps).
-- The rules, held by this database and not just by code:
--   * never SANTA: a sweep of the SANTA mint (mainnet or devnet) is refused by a check;
--   * only from the Drop, Slots or Lottery pool (game spin / slots / lottery);
--   * always to the treasury: a sweep row has NO destination column; the worker's only destination is TREASURY_WALLET;
--   * only when Cody asked: a sweep must belong to a claim Cody signed that is still open ('requested'); the worker can't
--     make claims, only mark them done.
create table public.reward_claims (
  id bigserial primary key,
  by_wallet text not null,                 -- the admin wallet that signed
  nonce text not null unique,              -- the signed message's one-time number (used once)
  message text not null, signature text not null,
  status text not null default 'requested' check (status in ('requested', 'queued')),
  found jsonb,                             -- what the worker found to send: [{ game, mint, amount_raw }]
  created_at timestamptz not null default now()
);
create table public.reward_sweeps (
  id bigserial primary key,
  claim_id bigint not null references public.reward_claims (id),
  game text not null check (game in ('spin', 'slots', 'lottery')),
  mint text not null check (mint not in ('3c7mmVSyEH8jfZXgxvpLsETtko1Y16DyRJ5XYB4snhGt', 'Jx95so9XYhtSJJoqup7Xb3T9Ptr9ZuUTXSgPcu6uttg')),
  token_program text not null check (token_program in ('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')),
  decimals int not null check (decimals between 0 and 18),
  amount_raw bigint not null check (amount_raw > 0),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  tx text unique, blockhash text, attempts int not null default 0,
  created_at timestamptz not null default now()
);
-- one sweep at a time per pool and token: a second claim while one is still on its way finds nothing new to queue
create unique index reward_sweeps_one_in_flight on public.reward_sweeps (game, mint) where status in ('queued', 'sending');

alter table public.reward_claims enable row level security;
alter table public.reward_sweeps enable row level security;
revoke all on public.reward_claims, public.reward_sweeps from anon, authenticated;

-- the worker (020's santa_worker): read both; mark a claim queued; add sweeps (only for an open claim; no destination exists
-- to set); update ONLY the sending state of a sweep, like the other money queues
grant select on public.reward_claims, public.reward_sweeps to santa_worker;
grant update (status, found) on public.reward_claims to santa_worker;
grant insert (claim_id, game, mint, token_program, decimals, amount_raw) on public.reward_sweeps to santa_worker;
grant usage on sequence public.reward_sweeps_id_seq to santa_worker;
grant update (status, tx, blockhash, attempts) on public.reward_sweeps to santa_worker;
create policy worker_read on public.reward_claims for select to santa_worker using (true);
create policy worker_mark on public.reward_claims for update to santa_worker using (status = 'requested') with check (status = 'queued');
create policy worker_read on public.reward_sweeps for select to santa_worker using (true);
create policy worker_add on public.reward_sweeps for insert to santa_worker
  with check (status = 'queued' and tx is null and attempts = 0 and exists (select 1 from public.reward_claims c where c.id = claim_id and c.status = 'requested'));
create policy worker_send on public.reward_sweeps for update to santa_worker using (true) with check (true);
