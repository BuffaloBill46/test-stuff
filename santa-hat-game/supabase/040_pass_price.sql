-- 040: the season pass costs $2 (Cody, 2026-10-04: "lower the season pass price to $2"; was $5). The Store charges what
-- mockups/seasons.js PASS_PRICE says (server/shop.js); this keeps the database's copy equal (tests/db/seasons-db.test.mjs).
-- A pass already bought keeps what was paid (season_passes.usd). Safe to apply twice.
update public.seasons set pass_usd = 2 where id in ('halloween', 'thanksgiving', 'christmas');
