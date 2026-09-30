-- NOT APPLIED YET. Draft for the game server (play credits, fair plays, payouts). Apply only when the server goes live,
-- with Cody's OK. Rules: DESIGN_NOTES → "Paying: play credits" and "Fair results: the order".
-- Players can READ their own credits and plays. Nothing here can be changed from the website: only the game server
-- (service role) calls the functions below, and the rules that must never break are CHECK constraints, so the database
-- itself refuses a bad change whatever code sends it.

-- Price quotes: the server locks a SANTA price for 60 seconds before the player pays.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('spin10', 'spin100', 'big')),
  n int not null check (n between 1 and 10),
  usd numeric(10, 2) not null check (usd > 0),
  santa_raw bigint not null check (santa_raw > 0),     -- smallest units (6 decimals)
  price_usd numeric not null check (price_usd > 0),
  created_at timestamptz not null default now(),
  used_by text                                          -- the payment signature that used it
);

-- Payments: each on-chain payment buys credits exactly once (the signature is the key).
create table public.payments (
  signature text primary key,
  quote_id uuid not null unique references public.quotes (id),
  profile_id uuid not null references public.profiles (id),
  kind text not null, n int not null check (n between 1 and 10),
  paid_raw bigint not null, burned_raw bigint not null, arrived_raw bigint not null,
  confirmed_at timestamptz not null default now()
);

-- Credits, per player, game and size. The books must always balance: bought = used + left.
create table public.credits (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('spin10', 'spin100', 'big')),
  left_n int not null default 0 check (left_n >= 0),
  bought int not null default 0, used int not null default 0,
  primary key (profile_id, kind),
  check (bought = used + left_n)
);

-- Plays, in Cody's order: 'spent' (credit taken, no secret yet) → 'open' (secret locked, fingerprint shown)
-- → 'settled' (result paid, secret revealed) or 'refunded' (credit given back). A play can't skip a step.
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
  spent_at timestamptz not null default now(), opened_at timestamptz, settled_at timestamptz,
  unique (profile_id, play_no),
  check (state = 'spent' or state = 'refunded' or (commit is not null and secret is not null)),  -- open/settled have a locked secret
  check (state <> 'settled' or (player_seed is not null and result is not null))
);

-- Pools (a mirror of the on-chain pool wallets) and every change to them, for the admin screen and public trust.
create table public.pools (
  game text primary key check (game in ('spin', 'slots')),
  pool numeric(14, 6) not null check (pool >= 0),
  treasury_net numeric(14, 6) not null default 0,
  rules jsonb not null,                                -- the same shape as SPIN_RULES / POOL_RULES; "paused" is the emergency stop
  updated_at timestamptz not null default now()
);
create table public.pool_log (
  id bigserial primary key, game text not null, what text not null, amount numeric(14, 6), tx text, by_wallet text,
  at timestamptz not null default now()
);
-- Winner payouts: queued by the server, sent by a worker. Anything above the sanity cap is held for Cody.
create table public.payouts (
  id bigserial primary key, play_id bigint not null unique references public.plays (id),
  to_wallet text not null, amount_usd numeric(12, 2) not null check (amount_usd > 0),
  status text not null default 'queued' check (status in ('queued', 'held', 'sent', 'failed')),
  tx text, created_at timestamptz not null default now()
);

alter table public.quotes enable row level security;   alter table public.payments enable row level security;
alter table public.credits enable row level security;  alter table public.plays enable row level security;
alter table public.pools enable row level security;    alter table public.pool_log enable row level security;
alter table public.payouts enable row level security;
create policy credits_read_own on public.credits for select using (profile_id = public.my_profile_id());
create policy pools_read on public.pools for select using (true);
create policy pool_log_read on public.pool_log for select using (true);
revoke insert, update, delete on public.quotes, public.payments, public.credits, public.plays, public.pools, public.pool_log, public.payouts from anon, authenticated;

-- A player's own plays; the secret shows only once the play is settled.
create view public.my_plays with (security_barrier) as
  select id, kind, play_no, state, commit, case when state = 'settled' then secret end as secret, player_seed, result, pay, settled_at
  from public.plays where profile_id = public.my_profile_id();
grant select on public.my_plays to authenticated;

-- Server-only functions ------------------------------------------------------------------------
create function public.buy_credits(p_quote uuid, p_signature text, p_paid bigint, p_burned bigint, p_arrived bigint, p_arrived_usd numeric)
returns int language plpgsql security definer set search_path = '' as $$
declare q public.quotes; left_now int;
begin
  select * into q from public.quotes where id = p_quote for update;
  if q.id is null then raise exception 'unknown quote'; end if;
  if q.used_by is not null then raise exception 'quote already used'; end if;
  insert into public.payments (signature, quote_id, profile_id, kind, n, paid_raw, burned_raw, arrived_raw)
    values (p_signature, q.id, q.profile_id, q.kind, q.n, p_paid, p_burned, p_arrived);  -- a reused signature fails here
  update public.quotes set used_by = p_signature where id = q.id;
  insert into public.credits (profile_id, kind, left_n, bought) values (q.profile_id, q.kind, q.n, q.n)
    on conflict (profile_id, kind) do update set left_n = public.credits.left_n + q.n, bought = public.credits.bought + q.n
    returning left_n into left_now;
  -- the entry money reaches that game's pool now (dollars at the quote's price; OPEN: how SANTA price swings count, see TODO)
  update public.pools set pool = pool + p_arrived_usd, updated_at = now() where game = case when q.kind = 'big' then 'slots' else 'spin' end;
  return left_now;
end $$;

-- Step 2 of the order: take one credit (only if there is one; the row lock makes two taps safe) and start the play.
create function public.spend_credit(p_profile uuid, p_kind text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare next_no bigint; play_id bigint;
begin
  update public.credits set left_n = left_n - 1, used = used + 1 where profile_id = p_profile and kind = p_kind and left_n > 0;
  if not found then return null; end if;
  select coalesce(max(play_no), 0) + 1 into next_no from public.plays where profile_id = p_profile;
  insert into public.plays (profile_id, kind, play_no) values (p_profile, p_kind, next_no) returning id into play_id;
  return play_id;
end $$;

-- Step 3: lock the secret made AFTER the credit was spent.
create function public.lock_play(p_play bigint, p_commit text, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.plays set state = 'open', commit = p_commit, secret = p_secret, opened_at = now() where id = p_play and state = 'spent';
  if not found then raise exception 'play % is not waiting for a secret', p_play; end if;
end $$;

-- Steps 4–5: record the result (the server ran the game rules), update the pool, queue the payout.
create function public.settle_play(p_play bigint, p_seed text, p_result jsonb, p_pay numeric, p_pool numeric, p_treasury_net numeric, p_to_wallet text, p_cap numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare pl public.plays;
begin
  update public.plays set state = 'settled', player_seed = p_seed, result = p_result, pay = p_pay, settled_at = now()
    where id = p_play and state = 'open' returning * into pl;
  if pl.id is null then raise exception 'play % is not open', p_play; end if;
  update public.pools set pool = p_pool, treasury_net = p_treasury_net, updated_at = now()
    where game = case when pl.kind = 'big' then 'slots' else 'spin' end;
  if p_pay > 0 then
    insert into public.payouts (play_id, to_wallet, amount_usd, status) values (pl.id, p_to_wallet, p_pay, case when p_pay > p_cap then 'held' else 'queued' end);
  end if;
end $$;

-- Give the credit back (the pool refused the play, or something failed before a result existed).
create function public.refund_play(p_play bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare pl public.plays;
begin
  update public.plays set state = 'refunded' where id = p_play and state in ('spent', 'open') returning * into pl;
  if pl.id is null then raise exception 'play % cannot be refunded', p_play; end if;
  update public.credits set left_n = left_n + 1, used = used - 1 where profile_id = pl.profile_id and kind = pl.kind;
end $$;

revoke execute on function public.buy_credits, public.spend_credit, public.lock_play, public.settle_play, public.refund_play from public, anon, authenticated;
