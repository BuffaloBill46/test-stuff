-- NOT APPLIED YET. Stocking Stuffer (Cody's brief, 2026-10-02): a new single-player game, kind 'stocking', played in runs like
-- Snowball Drop and paid into the same Drop pool (the 'spin' pool row). Rules: mockups/stocking.js; server: server/games.js.
-- 005 only allows the kinds 'spin', 'big' and 'drop' on quotes and runs, so a Stocking Stuffer quote would be refused by the
-- database itself. This widens those two checks to add 'stocking'; nothing else changes:
--   * payments.kind and plays.kind have no kind check (they copy the quote's kind);
--   * buy_run / settle_play / refund_play send every kind except 'big' to the 'spin' (Drop) pool, so Stocking Stuffer's money
--     goes there with no function change;
--   * the payout cap comes from the server (maxPerPlay: the play's top prize, 250× the turn with Cody's table).
-- Safe to run more than once (drop if exists, then add). The constraint names are Postgres's defaults for 005's inline checks,
-- checked on a database built from the files (tests/db/stocking-db.test.mjs); confirm them on the live project before applying:
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('quotes_kind_check', 'runs_kind_check');
alter table public.quotes drop constraint if exists quotes_kind_check,
  add constraint quotes_kind_check check (kind in ('spin', 'big', 'drop', 'stocking'));
alter table public.runs drop constraint if exists runs_kind_check,
  add constraint runs_kind_check check (kind in ('spin', 'big', 'drop', 'stocking'));
