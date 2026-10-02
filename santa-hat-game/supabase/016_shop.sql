-- NOT APPLIED YET. The shop (Cody, 2026-10-02: "make sure every button has a complete start to end path ... check all items that
-- can be purchased"): Store items (special snowballs, special gear, looks on the Avatar screen), buying a level (2–5), and extra
-- ranked tickets, paid in SANTA in ONE transaction from the player's wallet: 50% burned, 50% to the treasury (DESIGN_NOTES →
-- Economy). Same steps as a game run or a lottery ticket: a 60-second quote → the wallet pays → the server checks the payment on
-- chain (server/verify.js) → shop_buy grants it, once. Server-only (server/shop.js); players can read nothing here.
-- Needs 006 (ranked tickets: buy_tickets), 010 (buy_level), 015 (gear_wear) applied first.

create table public.shop_quotes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('item', 'level', 'tickets')),
  item_id text references public.items (id),
  to_level int check (to_level between 2 and 5),
  n int check (n between 1 and 10),
  usd numeric(10, 2) not null check (usd > 0),
  santa_raw bigint not null check (santa_raw > 0),
  price_usd numeric not null check (price_usd > 0),
  created_at timestamptz not null default now(),
  used_by text unique,                                       -- the payment that used it (a quote buys once)
  check ((kind = 'item') = (item_id is not null) and (kind = 'level') = (to_level is not null) and (kind = 'tickets') = (n is not null))
);
create index shop_quotes_recent on public.shop_quotes (profile_id, created_at);

-- Every item bought: the payment (one item per payment, ever) and what it cost.
create table public.item_purchases (
  signature text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.items (id),
  usd numeric(10, 2) not null check (usd > 0),
  paid_raw bigint not null check (paid_raw > 0),
  at timestamptz not null default now()
);

-- A checked payment that couldn't be granted (the player's level changed after the quote, the daily ticket limit was reached by
-- another purchase, the item was bought twice at once): the player paid, so the FULL amount is owed back from the treasury.
-- Cody pays these by hand from the admin screen for now (like the lottery's manual mode); 'paid' records the refund transaction.
create table public.shop_refunds (
  signature text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  to_wallet text not null,
  amount_raw bigint not null check (amount_raw > 0),
  why text not null,
  status text not null default 'owed' check (status in ('owed', 'paid')),
  refund_tx text unique,
  at timestamptz not null default now()
);

alter table public.shop_quotes enable row level security;
alter table public.item_purchases enable row level security;
alter table public.shop_refunds enable row level security;
revoke all on public.shop_quotes, public.item_purchases, public.shop_refunds from anon, authenticated;

-- Grant what a checked payment bought. Called by the server ONLY after server/verify.js accepted the transaction for this quote.
-- Once per quote and once per payment (both are unique). Items: refused if already owned, except gear that has worn out, which
-- can be bought again for a fresh 7 days (its clock row is removed). Levels: buy_level (one level at a time, never above 5).
-- Tickets: buy_tickets (at most 10 extra a day). Returns what was granted.
create function public.shop_buy(p_quote uuid, p_signature text, p_paid bigint, p_wallet text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.shop_quotes; owned boolean; lvl int; extra int;
begin
  select * into q from public.shop_quotes where id = p_quote for update;
  if q.id is null then raise exception 'unknown quote'; end if;
  if q.used_by is not null then raise exception 'quote already used'; end if;
  -- a reused payment fails here (unique), BEFORE anything is granted or owed
  update public.shop_quotes set used_by = p_signature where id = q.id;
  return public.shop_grant(q, p_signature, p_paid);
exception when others then
  -- the payment was real (the server checked it) but nothing could be granted: owe it back, in full. A reused payment or quote
  -- is NOT owed (nothing new was paid), so those are raised as before.
  if sqlerrm ~ '(duplicate key|already used|unknown quote)' then raise; end if;
  update public.shop_quotes set used_by = p_signature where id = p_quote;
  insert into public.shop_refunds (signature, profile_id, to_wallet, amount_raw, why) select p_signature, profile_id, p_wallet, p_paid, sqlerrm from public.shop_quotes where id = p_quote;
  return jsonb_build_object('refunded', true, 'why', sqlerrm);
end $$;
create function public.shop_grant(q public.shop_quotes, p_signature text, p_paid bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owned boolean; lvl int; extra int;
begin
  if q.kind = 'item' then
    owned := exists (select 1 from public.inventory where profile_id = q.profile_id and item_id = q.item_id);
    if owned and not public.gear_worn_out(q.profile_id, q.item_id) then raise exception 'you already own that'; end if;
    insert into public.item_purchases (signature, profile_id, item_id, usd, paid_raw) values (p_signature, q.profile_id, q.item_id, q.usd, p_paid);
    insert into public.inventory (profile_id, item_id) values (q.profile_id, q.item_id) on conflict do nothing;
    delete from public.gear_wear where profile_id = q.profile_id and item_id = q.item_id;  -- worn-out gear bought again: a fresh 7 days
    return jsonb_build_object('item', q.item_id);
  elsif q.kind = 'level' then
    lvl := public.buy_level(q.profile_id, p_signature, p_paid, q.to_level);
    return jsonb_build_object('level', lvl);
  else
    extra := public.buy_tickets(q.profile_id, q.n, p_signature);
    return jsonb_build_object('tickets', q.n, 'extra', extra);
  end if;
end $$;
revoke execute on function public.shop_buy(uuid, text, bigint, text), public.shop_grant(public.shop_quotes, text, bigint) from public, anon, authenticated;
