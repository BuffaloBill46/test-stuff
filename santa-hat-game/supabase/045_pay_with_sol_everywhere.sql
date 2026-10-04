-- 045: PAYING WITH SOL at the price, everywhere (Cody, 2026-10-04: "they are only charged $1 and whatever makes it to the pool is
-- what it gets"). Every quote that offers SOL keeps the WHOLE price in SOL (lamports) it offered, so the payment check
-- (server/verify.js) holds the player to exactly that: the games and the lottery now too (044 added it to the Store's quotes; its
-- meaning there is now the whole price as well, the treasury's SOL share being worked out from it). Null: SANTA only (devnet, or
-- the SOL price was down). Each table only if it exists (test databases load some files only). Safe to apply twice.
do $$ begin
  if to_regclass('public.quotes') is not null then
    alter table public.quotes add column if not exists sol_lamports bigint check (sol_lamports > 0); end if;
  if to_regclass('public.lottery_quotes') is not null then
    alter table public.lottery_quotes add column if not exists sol_lamports bigint check (sol_lamports > 0); end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shop_quotes' and column_name = 'sol_lamports') then
    comment on column public.shop_quotes.sol_lamports is 'paying with SOL: the whole price in lamports (045); the treasury gets the share not burned'; end if;
end $$;
