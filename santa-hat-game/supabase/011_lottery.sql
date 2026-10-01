-- NOT APPLIED YET. The Santa Lottery (Cody, 2026-10-01; rules mockups/lottery.js, server server/lottery.js, DESIGN_NOTES →
-- "Santa Lottery"). Server-run: ticket money goes to ONE lottery wallet (each draw keeps its own books). Winners are paid either
-- by the payout worker from that wallet ('auto', escrow) or by Cody himself, who records each send ('manual'; Cody hasn't decided:
-- it's one setting, lottery_settings.payout_mode). Only the game server (service role) writes any of it; players can read the
-- public parts (draws, the ticket list, winners) so anyone can re-check a draw.

create table public.lottery_settings (
  id int primary key default 1 check (id = 1),
  payout_mode text not null default 'manual' check (payout_mode in ('auto', 'manual')),
  updated_at timestamptz not null default now()
);
insert into public.lottery_settings (id) values (1);

-- One row per draw. The secret is made when the draw opens; only its fingerprint (commit) is public until the draw.
create table public.lottery_draws (
  id bigserial primary key,
  kind text not null check (kind in ('daily-10', 'daily-100', 'weekly-10', 'weekly-100', 'christmas')),
  draws_at timestamptz not null,
  commit text not null check (commit ~ '^[0-9a-f]{64}$'),
  secret text not null,                                   -- server-only until drawn (see the public view below)
  status text not null default 'open' check (status in ('open', 'drawn')),
  pot_raw bigint not null default 0 check (pot_raw >= 0),  -- exactly what ARRIVED in the lottery wallet for this draw
  tickets int not null default 0 check (tickets >= 0),
  blockhash text, block_slot bigint,                      -- from AFTER sales closed; recorded at the draw
  drawn_at timestamptz,
  unique (kind, draws_at),
  check (status = 'open' or (blockhash is not null and drawn_at is not null))
);

-- Price quotes for tickets (60 s, like the games). n = how many tickets (no cap per player; a sanity limit per purchase).
create table public.lottery_quotes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  draw_id bigint not null references public.lottery_draws (id),
  n int not null check (n between 1 and 10000),
  usd numeric(12, 2) not null check (usd > 0),
  santa_raw bigint not null check (santa_raw > 0),
  price_usd numeric not null check (price_usd > 0),
  created_at timestamptz not null default now(),
  used_by text
);

-- A confirmed payment: n tickets, numbered first_no .. first_no + n - 1 within its draw. One per payment signature.
create table public.lottery_buys (
  signature text primary key,
  quote_id uuid not null unique references public.lottery_quotes (id),
  draw_id bigint not null references public.lottery_draws (id),
  profile_id uuid not null references public.profiles (id),
  wallet text not null,
  first_no int not null check (first_no >= 1), n int not null check (n >= 1),
  paid_raw bigint not null, burned_raw bigint not null, arrived_raw bigint not null check (arrived_raw > 0),
  moved_from bigint references public.lottery_draws (id), -- paid after its own draw ran: moved to the next one (DESIGN_NOTES)
  at timestamptz not null default now()
);

-- What each winner is owed (place 1–3), or a full refund (place 0: a Christmas payment that arrived after the draw).
-- 'queued' → the payout worker sends it (auto); 'manual' → waits for Cody to send it and record the transaction; then 'sent'.
create table public.lottery_payouts (
  id bigserial primary key,
  draw_id bigint not null references public.lottery_draws (id),
  place int not null check (place between 0 and 3),
  profile_id uuid not null references public.profiles (id),
  to_wallet text not null,
  amount_raw bigint not null check (amount_raw > 0),
  status text not null default 'queued' check (status in ('queued', 'manual', 'sending', 'sent', 'failed')),
  tx text unique, blockhash text, attempts int not null default 0,
  created_at timestamptz not null default now(),
  unique (draw_id, place, profile_id)
);

alter table public.lottery_settings enable row level security; alter table public.lottery_draws enable row level security;
alter table public.lottery_quotes enable row level security;   alter table public.lottery_buys enable row level security;
alter table public.lottery_payouts enable row level security;
revoke all on public.lottery_settings, public.lottery_draws, public.lottery_quotes, public.lottery_buys, public.lottery_payouts from anon, authenticated;
revoke all on sequence public.lottery_draws_id_seq, public.lottery_payouts_id_seq from anon, authenticated;

-- Public, read-only views: anyone can re-check a draw (the secret shows only once drawn; wallets are shortened).
create view public.lottery_public as
  select id, kind, draws_at, commit, case when status = 'drawn' then secret end as secret, status, pot_raw, tickets, blockhash, block_slot, drawn_at
  from public.lottery_draws;
create view public.lottery_ticket_list as
  select draw_id, first_no, n, left(wallet, 4) || '…' || right(wallet, 4) as wallet_short from public.lottery_buys;
grant select on public.lottery_public, public.lottery_ticket_list to anon, authenticated;

-- Server-only functions ------------------------------------------------------------------------
-- A confirmed ticket payment: numbers the tickets in its draw and adds what ARRIVED to that draw's pot. If the quote's draw has
-- already been drawn, the tickets go to p_next (the next draw of that lottery); with no next draw (Christmas) the whole payment
-- becomes a refund payout. Returns the draw the tickets are in (null when refunded).
create function public.buy_lottery(p_quote uuid, p_signature text, p_wallet text, p_paid bigint, p_burned bigint, p_arrived bigint, p_next bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare q public.lottery_quotes; d public.lottery_draws; target bigint; first int;
begin
  select * into q from public.lottery_quotes where id = p_quote for update;
  if q.id is null then raise exception 'unknown quote'; end if;
  if q.used_by is not null then raise exception 'quote already used'; end if;
  update public.lottery_quotes set used_by = p_signature where id = q.id;
  select * into d from public.lottery_draws where id = q.draw_id for update;
  target := d.id;
  -- Once a draw's time has passed, no ticket can join it (even before the draw has run), so its ticket list is final the moment
  -- it's due: a payment that confirms late goes to the next draw, or is refunded when there's none.
  if d.status <> 'open' or d.draws_at <= now() then
    if p_next is null then
      insert into public.lottery_buys (signature, quote_id, draw_id, profile_id, wallet, first_no, n, paid_raw, burned_raw, arrived_raw)
        values (p_signature, q.id, d.id, q.profile_id, p_wallet, 1, q.n, p_paid, p_burned, p_arrived);
      insert into public.lottery_payouts (draw_id, place, profile_id, to_wallet, amount_raw, status)
        values (d.id, 0, q.profile_id, p_wallet, p_arrived, (select case when payout_mode = 'auto' then 'queued' else 'manual' end from public.lottery_settings));
      return null;
    end if;
    select * into d from public.lottery_draws where id = p_next and kind = d.kind and status = 'open' and draws_at > now() for update;
    if d.id is null then raise exception 'no open next draw'; end if;
    target := d.id;
  end if;
  first := d.tickets + 1;
  insert into public.lottery_buys (signature, quote_id, draw_id, profile_id, wallet, first_no, n, paid_raw, burned_raw, arrived_raw, moved_from)
    values (p_signature, q.id, target, q.profile_id, p_wallet, first, q.n, p_paid, p_burned, p_arrived, case when target <> q.draw_id then q.draw_id end);
  update public.lottery_draws set tickets = tickets + q.n, pot_raw = pot_raw + p_arrived where id = target;
  return target;
end $$;

-- The draw (the server picked the winners from the public inputs with mockups/lottery.js). p_winners: [{place, profile, wallet,
-- amount_raw}]. The amounts must add up to the pot exactly, or nothing is recorded. Once per draw.
create function public.finish_lottery_draw(p_draw bigint, p_blockhash text, p_slot bigint, p_winners jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.lottery_draws; w jsonb; total bigint := 0; mode text;
begin
  select * into d from public.lottery_draws where id = p_draw for update;
  if d.id is null then raise exception 'unknown draw'; end if;
  if d.status <> 'open' then raise exception 'already drawn'; end if;
  if now() < d.draws_at then raise exception 'not time yet'; end if;
  select coalesce(sum((x ->> 'amount_raw')::bigint), 0) into total from jsonb_array_elements(p_winners) x;
  if total <> d.pot_raw then raise exception 'the winners'' amounts (%) must add up to the pot (%)', total, d.pot_raw; end if;
  select case when payout_mode = 'auto' then 'queued' else 'manual' end into mode from public.lottery_settings;
  for w in select * from jsonb_array_elements(p_winners) loop
    insert into public.lottery_payouts (draw_id, place, profile_id, to_wallet, amount_raw, status)
      values (p_draw, (w ->> 'place')::int, (w ->> 'profile')::uuid, w ->> 'wallet', (w ->> 'amount_raw')::bigint, mode);
  end loop;
  update public.lottery_draws set status = 'drawn', blockhash = p_blockhash, block_slot = p_slot, drawn_at = now() where id = p_draw;
end $$;

revoke execute on function public.buy_lottery, public.finish_lottery_draw from public, anon, authenticated;
