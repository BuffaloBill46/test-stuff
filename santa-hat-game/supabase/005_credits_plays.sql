-- NOT APPLIED YET. Draft for the game server (runs of plays, fair plays, payouts). Apply only when the server goes live,
-- with Cody's OK. Rules: DESIGN_NOTES → "Paying: play credits" and "Fair results: the order".
-- RUNS, not stored credits (Cody, 2026-10-01): one payment buys 1, 5 or 10 plays of one game at one size; they play straight
-- away; when the run's last play is done its winnings (+ the price of any refused play) are queued as ONE payout to the
-- player's wallet automatically. No balance is ever kept for a player.
-- Players can READ their own plays. Nothing here can be changed from the website: only the game server
-- (service role) calls the functions below, and the rules that must never break are CHECK constraints, so the database
-- itself refuses a bad change whatever code sends it.

-- Price quotes: the server locks a SANTA price for 60 seconds before the player pays.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('spin', 'big', 'drop')),
  n int not null check (n in (1, 5, 10)),              -- a run of 1, 5 or 10 plays (Cody)
  bet numeric(10, 2) not null check (bet > 0),         -- the size of each play (Spin / Snowball Drop: 10¢ or $1; Big Hat: $1)
  usd numeric(10, 2) not null check (usd > 0),         -- n × bet
  santa_raw bigint not null check (santa_raw > 0),     -- smallest units (6 decimals)
  price_usd numeric not null check (price_usd > 0),
  created_at timestamptz not null default now(),
  used_by text,                                         -- the payment signature that used it
  check (usd = n * bet)
);

-- Payments: each on-chain payment buys one run exactly once (the signature is the key).
create table public.payments (
  signature text primary key,
  quote_id uuid not null unique references public.quotes (id),
  profile_id uuid not null references public.profiles (id),
  kind text not null, n int not null check (n in (1, 5, 10)),
  paid_raw bigint not null, burned_raw bigint not null, arrived_raw bigint not null,
  confirmed_at timestamptz not null default now()
);

-- Runs: what one payment bought. Its plays are made right after the payment; paid_at is set once, when its last play is done.
create table public.runs (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id),
  signature text not null unique references public.payments (signature),
  kind text not null check (kind in ('spin', 'big', 'drop')),
  n int not null check (n in (1, 5, 10)), bet numeric(10, 2) not null check (bet > 0),
  settings_version int not null default 0,            -- the game settings (odds, prizes) its plays run on
  created_at timestamptz not null default now(), paid_at timestamptz
);

-- Game settings (Cody's admin screen): prices, odds, prizes, store. Every change is a new signed version; version 0 is the
-- built-in game (mockups/settings.js). Public: anyone can see the odds every play ran on.
create table public.game_settings (
  version int primary key check (version > 0), settings jsonb not null,
  by_wallet text not null, nonce text not null unique, message text not null, signature text not null,
  created_at timestamptz not null default now()
);
alter table public.game_settings enable row level security;
create policy game_settings_read on public.game_settings for select using (true);
revoke insert, update, delete on public.game_settings from anon, authenticated;

-- Plays, in Cody's order: 'spent' (paid for, no secret yet) → 'open' (secret locked, fingerprint shown)
-- → 'settled' (result recorded, secret revealed) or 'refunded' (the pool refused it; its price goes back with the run).
create table public.plays (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id),
  kind text not null,
  play_no bigint not null,
  state text not null default 'spent' check (state in ('spent', 'open', 'settled', 'refunded')),
  commit text check (commit ~ '^[0-9a-f]{64}$'),
  secret text,
  player_seed text,
  result jsonb,
  pay numeric(12, 2),
  run_id bigint not null references public.runs (id),
  bet numeric(10, 2),                                  -- the price of this play (Spin / Snowball Drop: 0.10 or 1.00)
  pay_raw bigint not null default 0 check (pay_raw >= 0),  -- what it sends, in SANTA (a prize, or a refused play's price)
  settings_version int not null default 0,             -- the game settings (odds, prizes) this play ran on
  price_usd numeric,                                   -- the live SANTA price the play was settled at
  spent_at timestamptz not null default now(), opened_at timestamptz, settled_at timestamptz,
  unique (profile_id, play_no),
  check (state = 'spent' or state = 'refunded' or (commit is not null and secret is not null)),  -- open/settled have a locked secret
  check (state <> 'settled' or (player_seed is not null and result is not null))
);

-- Pools (a mirror of the on-chain pool wallets) and every change to them, for the admin screen and public trust.
-- Pools hold SANTA (Cody, 2026-09-30): balances are in the token's smallest unit and float in dollars with the price.
-- Changes are added/subtracted (never overwritten), so two plays can't erase each other's change; it can't go below zero.
create table public.pools (
  game text primary key check (game in ('spin', 'slots')),
  santa_raw bigint not null check (santa_raw >= 0),
  treasury_net_raw bigint not null default 0,
  rules jsonb not null,                                -- the same shape as SPIN_RULES / POOL_RULES; "paused" is the emergency stop
  updated_at timestamptz not null default now()
);
create table public.pool_log (
  id bigserial primary key, game text not null, what text not null, amount numeric(14, 6), tx text, by_wallet text,
  nonce text unique, details jsonb,                    -- admin changes: the signed message's one-time number (no replays)
  at timestamptz not null default now()
);
-- Winner payouts: ONE per finished run that won something, queued by the server, sent by a worker. Anything above the sanity
-- cap is held for Cody.
create table public.payouts (
  id bigserial primary key, run_id bigint not null unique references public.runs (id),   -- a run is paid once
  to_wallet text not null, amount_usd numeric(12, 2) not null check (amount_usd > 0),
  amount_raw bigint not null check (amount_raw > 0), price_usd numeric not null check (price_usd > 0),  -- SANTA fixed at the settle price
  -- queued → sending (signed; its signature saved BEFORE it's sent) → sent. 'held' waits for Cody. Never paid twice:
  -- a 'sending' payout is re-signed only after its old transaction's blockhash has expired (it can then never land).
  status text not null default 'queued' check (status in ('queued', 'held', 'sending', 'sent', 'failed')),
  tx text unique, blockhash text, attempts int not null default 0, created_at timestamptz not null default now()  -- one transaction per row, never shared (payouts.js)
);

-- Skims (pool → treasury) and top-offs (treasury → pool) are REAL transfers, queued like payouts so the books never drift
-- from the wallets (audit 2026-09-30: they used to happen only in the database). Skims are sent by the payout worker with the
-- pool's key. Top-offs are paid by Cody HIMSELF (Cody, 2026-09-30): he sends SANTA to the pool wallet, then records the deposit
-- on the admin screen ('record-deposit', server/admin.js checks it on the chain). Until then a top-off waits as 'needs_approval'
-- (shown as "waiting for your deposit"). A recorded deposit is a 'deposit' row (its transaction signature can be recorded once);
-- it marks waiting top-offs paid, oldest first, and anything beyond them is added to the pool.
create table public.pool_transfers (
  id bigserial primary key, play_id bigint references public.plays (id), game text not null check (game in ('spin', 'slots')),
  kind text not null check (kind in ('skim', 'top-off', 'deposit')),
  amount_raw bigint not null check (amount_raw > 0),
  status text not null default 'queued' check (status in ('needs_approval', 'queued', 'sending', 'sent', 'failed')),
  tx text unique, blockhash text, attempts int not null default 0, created_at timestamptz not null default now()  -- one transaction per row, never shared (payouts.js)
);
alter table public.pool_transfers enable row level security;
create policy pool_transfers_read on public.pool_transfers for select using (true);  -- public, like the pool log

-- SANTA price samples (audit 2026-09-30): the game uses the middle value of the last 10 minutes, not one live reading, so a
-- brief pump or dump of SANTA's thin trading pool can't be used to buy credits cheap or win extra SANTA.
create table public.price_samples (at timestamptz primary key default now(), usd numeric not null check (usd > 0));
alter table public.price_samples enable row level security;

alter table public.quotes enable row level security;   alter table public.payments enable row level security;
alter table public.runs enable row level security;     alter table public.plays enable row level security;
alter table public.pools enable row level security;    alter table public.pool_log enable row level security;
alter table public.payouts enable row level security;
create policy runs_read_own on public.runs for select using (profile_id = public.my_profile_id());
create policy pools_read on public.pools for select using (true);
create policy pool_log_read on public.pool_log for select using (true);
revoke insert, update, delete on public.quotes, public.payments, public.runs, public.plays, public.pools, public.pool_log, public.payouts, public.pool_transfers from anon, authenticated;

-- A player's own plays; the secret shows only once the play is settled.
create view public.my_plays with (security_barrier) as
  select id, kind, play_no, state, commit, case when state = 'settled' then secret end as secret, player_seed, result, pay, settled_at
  from public.plays where profile_id = public.my_profile_id();
grant select on public.my_plays to authenticated;

-- Server-only functions ------------------------------------------------------------------------
-- Step 1 of the order: the confirmed payment buys a run, and its n plays are made ('spent': no secret yet).
create function public.buy_run(p_quote uuid, p_signature text, p_paid bigint, p_burned bigint, p_arrived bigint, p_version int default 0)
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
  -- the SANTA that arrived reaches that game's pool now
  update public.pools set santa_raw = santa_raw + p_arrived, updated_at = now() where game = case when q.kind = 'big' then 'slots' else 'spin' end;
  return rid;
end $$;

-- Step 2: lock the secret made AFTER the payment (one per play).
create function public.lock_play(p_play bigint, p_commit text, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.plays set state = 'open', commit = p_commit, secret = p_secret, opened_at = now() where id = p_play and state = 'spent';
  if not found then raise exception 'play % is not waiting for a secret', p_play; end if;
end $$;

-- Steps 3–4: record the result (the server ran the game rules) and update the pool. The prize is SENT with the run (finish_run).
-- p_pool_delta_raw / p_treasury_delta_raw: the exact SANTA the pool gained or lost on this play (payout, skim, top-off).
create function public.settle_play(p_play bigint, p_seed text, p_result jsonb, p_pay numeric, p_pay_raw bigint, p_price numeric,
  p_pool_delta_raw bigint, p_treasury_delta_raw bigint, p_to_wallet text, p_cap numeric, p_skim_raw bigint default 0, p_top_raw bigint default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare pl public.plays;
begin
  update public.plays set state = 'settled', player_seed = p_seed, result = p_result, pay = p_pay, pay_raw = p_pay_raw, price_usd = p_price, settled_at = now()
    where id = p_play and state = 'open' returning * into pl;
  if pl.id is null then raise exception 'play % is not open', p_play; end if;
  update public.pools set santa_raw = santa_raw + p_pool_delta_raw, treasury_net_raw = treasury_net_raw + p_treasury_delta_raw, updated_at = now()
    where game = case when pl.kind = 'big' then 'slots' else 'spin' end;
  if p_skim_raw > 0 then insert into public.pool_transfers (play_id, game, kind, amount_raw) values (pl.id, case when pl.kind = 'big' then 'slots' else 'spin' end, 'skim', p_skim_raw); end if;
  if p_top_raw > 0 then insert into public.pool_transfers (play_id, game, kind, amount_raw, status) values (pl.id, case when pl.kind = 'big' then 'slots' else 'spin' end, 'top-off', p_top_raw, 'needs_approval'); end if;
end $$;

-- The pool refused the play (emergency stop, pool refilling) or something failed before a result existed: its price goes
-- back to the player with the run, in SANTA at today's price, paid by the pool its entry went into.
create function public.refund_play(p_play bigint, p_refund_raw bigint default 0, p_price numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare pl public.plays;
begin
  update public.plays set state = 'refunded', pay = bet, pay_raw = p_refund_raw, price_usd = p_price, settled_at = now()
    where id = p_play and state in ('spent', 'open') returning * into pl;
  if pl.id is null then raise exception 'play % cannot be refunded', p_play; end if;
  update public.pools set santa_raw = santa_raw - p_refund_raw, updated_at = now() where game = case when pl.kind = 'big' then 'slots' else 'spin' end;
end $$;

-- The run's last play is done: queue ONE payout of everything it won + refunded, to the player's wallet. Once per run.
-- Returns the payout id, 0 when there was nothing to send (or it was already done), null while plays are unfinished.
create function public.finish_run(p_run bigint, p_to_wallet text, p_cap numeric) returns bigint
language plpgsql security definer set search_path = '' as $$
declare r public.runs; raw bigint; usd numeric; price numeric; pid bigint;
begin
  select * into r from public.runs where id = p_run for update;
  if r.id is null then raise exception 'unknown run'; end if;
  if r.paid_at is not null then return 0; end if;                      -- already done: never twice
  if exists (select 1 from public.plays where run_id = p_run and state in ('spent', 'open')) then return null; end if;
  select coalesce(sum(pay_raw), 0), coalesce(sum(pay), 0), max(price_usd) into raw, usd, price from public.plays where run_id = p_run;
  update public.runs set paid_at = now() where id = p_run;
  if raw = 0 then return 0; end if;
  insert into public.payouts (run_id, to_wallet, amount_usd, amount_raw, price_usd, status)
    values (p_run, p_to_wallet, usd, raw, price, case when usd > p_cap then 'held' else 'queued' end) returning id into pid;
  return pid;
end $$;

revoke execute on function public.buy_run, public.lock_play, public.settle_play, public.refund_play, public.finish_run from public, anon, authenticated;
