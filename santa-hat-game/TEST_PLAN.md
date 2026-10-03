# Pre-launch test plan (Cody, 2026-10-02)

Cody: "We will need to run a QA focus group audit player test. We need a player guide made with game and item info. Any other
test we can run?" Order agreed: finish Stocking Stuffer → player guide + tester script → tests 1–3 while testers play → 5–6 before
launch. Each line says what already exists, what's missing, and how it will be run.

## A. Focus group (real people, devnet money)
- Who: 5–10 people Cody picks; phones and computers both; at least two who have never used a Solana wallet.
- They get: the test link (`https://santahatgames.com/?server=https://api.santahatgames.com`),
  Phantom set to Devnet, test SANTA + devnet SOL sent with `tests/solana/devnet-gift.mjs <their address>` (capped, devnet only).
- A one-page tester script (to write): sign in (wallet and email), play an Auto match, buy an item and wear it, a Slots pull,
  a Drop, Stocking Stuffer, a lottery ticket, check a result, the guide. Then a short feedback form (to write; an artifact
  with a shared database so answers come back organised, not as texts).
- Watch for: anything confusing in the first 2 minutes, wallet steps that stall, a win that didn't arrive within a minute.

## B. Player guide (to write)
Every game (how to win, the odds, payback, the 3% SANTA tax on winnings, how to check a result), every Store item with its price
and effect, special snowballs and their snowball costs, gear rules (no stacking, 7-day wear), levels, ranked tickets
(10 free a day + up to 10 bought; 25 max), the lottery. Built from the code's own tables (catalog.js, gear.js, specials.js,
levels.js, plinko.js, slots.js, the new stocking rules) so numbers can't drift from the game.

## C. Tests Claude runs
1. **Money soak (to build):** thousands of real devnet plays across Slots, Drop, Stocking Stuffer and the Store through the live
   game server and worker, then the books = pool wallets to the unit (the alerts' books check, plus `reconcile.js`). Exists only
   in the no-network dress rehearsal (`tests/solana/rehearsal.mjs`, LiteSVM) and the single-payment devnet tests. Use the 5 devnet
   test players (`tests/solana/devnet-test-players.mjs`); pace for the public devnet RPC's rate limits (429s seen before).
2. **Crash (EXISTS):** `tests/solana/chain.devnet.mjs` kills the worker before and after sending on real devnet and proves nothing
   is paid twice or skipped. Re-run before launch; add one pass on the Droplet itself (stop `santa-worker` mid-batch).
3. **Crowd (measured 2026-10-02):** the real referee code, N full 8-player rooms in play, measured locally:
   100 rooms (800 players) ≈ 6% of one core, slowest tick 9.5 ms of a 33 ms budget; each room sends ~31 KB/s. On the Droplet
   (1 vCPU, 1 GB, 1 TB/month transfer) **bandwidth is the limit, not CPU**: ~12 rooms busy around the clock fill 1 TB/month;
   short busy hours are fine. Live crowd test from one machine is capped at 16 connections per address (worker/referee.mjs),
   so a live run needs several machines or a temporary raise; do it with Cody's OK at a quiet time.
4. **Phone wallets (needs Cody's phone):** Phantom's in-app browser on iPhone and Android. FINDING: in a phone's normal browser
   there is no wallet and the page only says "open this page inside the Phantom app's browser". Add an "Open in Phantom" button
   using Phantom's browse deeplink `https://phantom.com/ul/browse/<url-encoded page>?ref=<url-encoded origin>` (docs.phantom.com,
   "browse"; also Solflare: `https://solflare.com/ul/v1/browse/<url>?ref=<origin>`).
5. **Security review (agent + Claude's review):** adversarial pass over the money code: server/games.js, shop.js, lottery.js,
   verify.js, payouts.js, rewards.js, admin.js, the SQL grants. Every finding re-checked by Claude before it's believed.
6. **Mainnet dry run (at launch):** one 10¢ play through every money path (Slots, Drop, Stocking, a Store item, a lottery ticket,
   a skim, a reward claim) before announcing; books = wallets after each.
