-- 044: PAYING WITH SOL (Cody, 2026-10-04: "add the sol pay option when they buy stuff ... no extra steps"). The Store's price can
-- also be paid in SOL in the same one-approval transaction (mockups/pay.js): the burn share is swapped to SANTA and burned, the
-- rest goes to the treasury AS SOL. The quote keeps the SOL price it offered for that share, so the payment check
-- (server/verify.js) holds the player to exactly what they were shown. Null: no SOL price (devnet, or the SOL price was down).
-- Games and the lottery need nothing here: paid with SOL, the pool still receives SANTA. Safe to apply twice.
alter table public.shop_quotes add column if not exists sol_lamports bigint check (sol_lamports > 0);
