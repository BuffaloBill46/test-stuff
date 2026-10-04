# For Cody's main Claude: what this workspace couldn't do

Kept by the Claude that built the game (cloud workspace, no wallets, no live connections, no real money). Everything here was
**left undone on purpose** because it needs something this workspace doesn't have. Read `HANDOFF.md` first, then this list.
Tick items off here as they're done. Order is roughly the order to do them in for a devnet test.

> ## ⚠ START HERE: branch `ccr-55527f21-p10a6h` is the newest (cloud session, 2026-10-01)
> - **Done 2026-10-01: merged into `claude/test-stuff-section-egujzy`, which is now the branch to work and publish from.** (Was: work from `ccr-55527f21-p10a6h`.) It contains ALL of `claude/test-stuff-section-egujzy` plus this session. Merge it into
>   whatever branch you use before changing anything.
> - **The live site (gh-pages) was published from this branch.** Publishing from an older branch would silently REMOVE the
>   avatar Hats/Backpacks, the Ice Ball and the admin screen's "Check for bots" from the live site.
> - **The live database now has `008_hats_backpacks.sql` applied** (migration `008_hats_backpacks`; checked after: 5 hats,
>   4 backpacks, 7 snowballs, save_profile 7 slots, anon still can't call it). 005, 007 and 009 applied 2026-10-01 by main Claude; 006 still NOT applied.
> - What this session built, in order (each committed with tests; details in HANDOFF → "Where we are right now"):
>   1. **Payout worker double-send FIXED** (High): overlapping worker runs could pay a winner twice. Compare-and-set before
>      sending (`server/payouts.js`). Keep it if you rewrite the worker. Proven on a REAL Postgres (`tests/db/lock.test.mjs`).
>   2. **Pool row lock proven on real Postgres** (the old open item): plays take turns; with the lock removed the test fails.
>      "One run at a time" is checked at the QUOTE only (two quotes before paying = two runs, both paid correctly; kept on purpose).
>   3. **Speed limit** (`server/ratelimit.js`): 60 requests per connection / 40 per player per 10 s, then 429. Needs
>      `007_rate_limits.sql`. Plan: move the counts into the always-on server's memory (`memoryStore()`, one line). Check which
>      `x-forwarded-for` entry is the real visitor on the live function.
>   4. **Bot signals** (`server/bots.js`, admin action `bot-signals`, read only, private): "Check for bots" on the admin screen.
>   5. **Avatar Hats + Backpacks** and **special snowballs** (`catalog.js` `rules`; the referee `sim.js` applies them). First
>      one: **Ice Ball, stuns 50% longer**. All new items are **Store purchases for now** (Cody; he'll set levels later;
>      prices are placeholders). Cody is writing up more snowball types (faster, bigger, longer stun, splits).
>   6. Edge Function type check fixed (it had been failing since record-deposit); `tests/db/edge-limit.mjs` runs the REAL
>      function under Deno against real Postgres.
> - **Cody's decisions this session:** DigitalOcean for the always-on server (a NEW separate Droplet: it will hold pool keys);
>   Helius $49 plan (he thinks he has it: confirm); Cloudflare Turnstile at sign-in and at ranked start; alerts via his existing
>   Telegram bot (not Sentry); no multisig; hats/backpacks/Ice Ball bought, not levelled, for now. See "Cody's calls on servers" below.
> - **Open questions for Cody:** whether special snowballs count in RANKED (a bought edge there is pay-to-win); a lawyer's
>   check of the paid games before real money (RESEARCH.md → "Other things that would help").
> - **Testing on a machine with Postgres:** `tests/db/realpg.mjs` starts a throwaway real Postgres 16 (skips if none installed).

## Read first: everything that changed since the first hand-over (2026-09-30 evening → 2026-10-01)
All of it is committed, tested and live in the DEMO (no real money). Server/SQL parts are built and tested but NOT deployed.
Details of each decision: DESIGN_NOTES.md. Audit of the money changes: AUDIT.md → "Second pass"; saved reports: `audits/`.

**Cody's calls on servers and services (2026-10-01, late). Act on these.**
- **Always-on game server: DigitalOcean** (Cody already uses DO Droplets for his other game). Use a **separate Droplet** for
  Santa Hat: it will hold the pool wallets' keys, so it shouldn't share a machine with the other game. Sizing below.
- **Helius: Cody thinks he already has the $49 plan.** Confirm with him; use it for `SOLANA_RPC_URL` (Edge Function and worker).
- **No multisig** (Cody: not wanted). Don't build around Squads.
- **Cloudflare Turnstile ("are you human?" check): YES at sign-in and when a player starts a RANKED match** (not on every
  unranked match). Sign-in: Supabase Auth has built-in CAPTCHA support (Auth settings: CAPTCHA protection, Turnstile); check it
  also covers the Solana wallet sign-in when that's turned on. Ranked: check the Turnstile token on the server before a
  ticket is held. Free plan, no request cap.
- **Alerts go to Cody's existing Telegram bot** (he uses it for his other games), not Sentry. Ask Cody for the bot token and
  chat id in YOUR session (server secrets only, never the repo). Alert on: a payout frozen by the safety cap, a payout failed
  5 times, reconciliation drift (books ≠ wallet), a top-off waiting for his deposit, the server down, an emergency stop, and
  any STRONG bot signal (`server/bots.js`; a scheduled run of the same check the admin screen does).
- **Cost estimate Cody asked for: 1,000 players a day, 20–25 matches each** (measured from the real referee code; details in
  RESEARCH.md → "What 1,000 players a day would cost"): ~500–1,100 GB a month of data to players, ~80–100 players online on
  average, ~230–290 at a busy hour. Game logic is tiny (50 full rooms = under 1% of one core). On DigitalOcean a $6 Droplet
  (1 GB, 1,000 GB data included) is about right; the next size up if data runs over. (On Fly.io it would be ~$15–30/mo, mostly data.)
- **The multiplayer must move off Supabase Realtime before that load:** the free plan's 2 million messages a month would last
  hours, not a month. That's the referee server's job (TODO → "Cheat-proof referee server").

- **No credits, no balances: RUNS** (Cody, 2026-10-01). Each game has Play 1 / 5 / 10 at the size picked on the card.
  One confirm → `window.santaPay(quote)` ONCE for the whole run → the plays run → the run's last play queues ONE payout to
  the player's linked wallet automatically. No claim button, the player never signs to be paid. Full SQL/server detail in
  the ticked item below. Sizes: Spin 10¢ or $1, Snowball Drop 10¢ or $1, Big Hat $1. Quote body: `{kind, n, bet}`,
  `kind` = `spin` | `drop` | `big`.
- **Removed server actions:** `credits`, `open` (runs replaced them) and the player `history` action ("My plays" was removed
  by Cody: players don't need it; every play stays in the `plays` table). Web door actions now: `quote`, `buy`, `settle`
  (signed in) and `pools`, `settings`, `winners` (public).
- **Payout safety cap never holds a real win** (Cody, 2026-10-01: "I don't want a hold on a player that wins"). The cap is
  the most the run could POSSIBLY win from its own prize table: n × `maxPerPlay(cfg, kind, bet)` (`server/games.js`; $1 Big
  Hat: 11 lines × the $100 top prize + a hat bonus on all 25 squares = $1,101.50 a pull; Spin/Drop: exactly their top
  prize), + the price of any refunded play, + any pool jackpot. It was a fixed $205 before: that was only the biggest pull
  a simulation had SEEN, and a real pull could pass it. Proven as assertions over 600,036 results incl. bigger-prize
  settings (`tests/payoutcap.test.mjs`). Only an amount above it (a fault or break-in) is `held` ("frozen").
- **Frozen payouts + Release (built):** the admin screen lists frozen payouts (player name, wallet shortened to first 4 …
  last 4 because the `pools` answer is public, run, amount in $ and SANTA, when) with a **Release** button: a new
  wallet-signed admin action `release-payout` (`settings: {payout: id}`, game = the pool it pays from) that sets it back to
  `queued` (the worker sends it next pass) and logs it publicly as "release payout". Only a held payout, only from its own
  pool, once. If a payout is ever frozen, the player's run summary says "being checked before it's sent" (server `settle`
  returns `held: true`), never "sent". Tests: `tests/db/admin.test.mjs`, `tests/browser/admin-test.mjs`.

**The games (numbers are Cody's calls; about 80% payback on every game because "we lose 16% to fees")**
- **Spin is two wheels:** main wheel 40 equal segments (0× 20, 1× 12, 2× 5, gold star 3) → a star spins the bonus wheel of 12
  (3× 9, 4× 2, 5× 1). Pays back 80.0%. Fair numbers: the 1st picks the main segment, the 2nd the bonus segment; the re-check
  replays both. Rules `mockups/spin.js` (removed with the game, 2026-10-04).
- **Big Hat:** hat bonus 6¢ per Santa Hat on the grid → 78.1% + the pool jackpot ≈ 79.5%. `PAYTABLE.md` regenerated.
- **Snowball Drop (Plinko) is a third game** on the Games tab (preview also at `/plinko.html`): 8 rows of fair 50/50 bounces
  (one fair number per row, < 0.5 = left), 9 equal presents paying 10× · 5× · 1× · 0.4× · 0× from the edges in; 78.4%.
  **It shares the Spin pool** (its payments go to the Spin pool wallet; game `spin` in `pools`). Guard rail: Spin's top-off
  must cover Drop's $10 top prize. Simulated 6 million mixed plays: never refused. Rules `mockups/plinko.js`.

**Server and admin**
- **Bot signals (2026-10-01):** new admin action `bot-signals` (game `all`, wallet-signed, READ only: not logged, not public) →
  players whose timing looks scripted (`server/bots.js`); "Check for bots" on the admin screen. Signals only.
- **Speed limit (2026-10-01):** 60 requests a connection and 40 a player per 10 s, then 429 "slow down" (`server/ratelimit.js`,
  wired in `index.ts`). Needs `007_rate_limits.sql`. Plan (Cody): move it to the always-on game server later (`memoryStore()`).
- **Payout worker: overlapping runs were a double-payment bug, fixed 2026-10-01** (`server/payouts.js`: a worker sends only if
  its compare-and-set signature save wins). Found by the new real-Postgres test `tests/db/lock.test.mjs`, which also proves the
  pool lock. Note: a player CAN have two runs open if they get two quotes before paying either; allowed and proven safe.
- **Game settings are versioned and wallet-signed** (admin action `set-settings`, table `game_settings`): prices, both Spin
  wheels, Big Hat odds/prizes/symbols, jackpot % and odds, store items. Guard rails refuse unsafe changes; every run and play
  records the version it was bought/played on, so a change never lands mid-run and old plays re-check on their own odds.
  The admin screen has the editor. Logic `mockups/settings.js`.
- **Top-offs: Cody sends SANTA himself;** admin action `record-deposit` books what ARRIVED on the chain (ticked item below).
- **Price-pump guard:** plays are priced at the median of the last 10 minutes of once-a-minute samples
  (`server/price.js`, table `price_samples`). It samples itself when a quote comes in; no schedule needed.
- **Admin actions (all wallet-signed, replay-proof, logged):** `pause`, `resume`, `set-rules`, `set-settings`, `record-deposit`,
  `release-payout`.
- **Edge Function settings it reads:** `SOLANA_RPC_URL`, `SPIN_POOL_WALLET`, `SLOTS_POOL_WALLET`, `SANTA_MINT` (test token;
  unset = real SANTA), `ADMIN_WALLETS`, plus Supabase's own `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL`
  (provided by Supabase; never in the site or repo).

**The page**
- Phone layout fixed from Cody's Galaxy S22+ screenshots (matches sideways, top bar, Avatar camera; checked at 6 sizes by
  `tests/browser/phone-shots.mjs`). Snowball Drop's board only draws while on screen.
- "What's SANTA?" draft copy in `WHATS_SANTA.md`, waiting on Cody.

**Tests:** every suite passes (list in HANDOFF → How to test), including the server-mode browser test that buys a run of 5
through the real server code and checks ONE payout equal to the plays' winnings, and the on-chain rehearsal.

## Needs Cody (decisions, accounts, real money)
- [ ] **Supabase settings:** turn on Solana (Web3) sign-in; URL Configuration (Site URL `https://buffalobill46.github.io/test-stuff/`,
      Redirect `https://buffalobill46.github.io/test-stuff/**`); connect Resend for sign-in emails. (HANDOFF → Waiting on Cody.)
- [ ] **Pool wallets for the test:** a Spin pool and a Slots pool wallet (devnet first). Their PUBLIC addresses go in the Edge
      Function secrets `SPIN_POOL_WALLET` / `SLOTS_POOL_WALLET`. Until set, the server refuses all buying (built that way).
- [ ] **Treasury wallet address** (skims go there; top-offs are paid by Cody from any wallet he likes).
- [ ] **A devnet test token** with SANTA's settings (Token-2022, 6 decimals, 300 bps transfer fee). `tests/solana/split.test.mjs`
      shows exactly how it's made. Give the server its address with the Edge Function secret `SANTA_MINT` (no code change; unset
      = real SANTA). The page's live-price line still shows real SANTA's price and tax (`mockups/market.js`), which is fine for a test.

- [x] **Payback level: decided, about 80% on every game** (Cody, 2026-09-30; Spin 80.0%, Big Hat ≈ 79.5% with the jackpot).
      Rule tests and pool simulations re-run after the change. If he changes odds, re-run `tests/spin.test.mjs`, `tests/slots.test.mjs`,
      `tests/paytable.mjs` and the pool simulations before launch.
- [x] **Decided (Cody, 2026-09-30): Cody pays top-offs himself** by sending SANTA to the pool wallet. Built: a top-off waits in
      `pool_transfers` as `needs_approval` (admin screen: "waiting for your deposit" + how much to send, tax included); Cody pastes
      the transaction signature → `record-deposit` (`server/admin.js`) reads what ARRIVED from the chain, marks top-offs paid, adds
      any extra to the pool (tested on real Postgres with books = wallet at every step, `tests/db/admin.test.mjs`). No key needed.
      Left for you: check it once with a real devnet deposit (the Edge Function already passes its `chain` to the admin).

- [x] **Snowball Drop is in the arcade** (2026-10-01): shares the Spin pool; its payments go to the **Spin** pool wallet.

- [x] **Credits removed; RUNS with automatic payouts (Cody, 2026-10-01).** A payment buys a run of 1, 5 or 10 plays of one game at
      one size; the plays run straight away and the run's last play queues ONE payout (its winnings + any refused play's price)
      to the player's linked wallet. No claim, no player signature. What changed in `005_credits_plays.sql` (applied live 2026-10-01;
      the file name is older than the design): no `credits` table; new `runs` (one per payment signature); `quotes.n` in 1/5/10
      with `usd = n × bet`; `plays.run_id` (required) and `plays.pay_raw`; `payouts.run_id` unique (was `play_id`); functions
      `buy_run`, `lock_play`, `settle_play` (no payout insert), `refund_play`, `finish_run(p_run, p_to_wallet, p_cap)`, with
      cap = the most the run could possibly win (see "Payout safety cap" above). The server refuses a quote up front when the player has an unfinished run, has no linked
      wallet, or the pool can't take the play; `tidy` finishes runs left behind (closed tab). The web door's actions are now
      `quote {kind, n, bet}`, `buy`, `settle` (`credits` and `open` are gone). The payout worker sends whatever is queued, so a
      run's payout goes out on its next pass (one change, 2026-10-01: overlapping worker runs can no longer send a payout
      twice; see "Run the payout worker live"). Proven: `tests/db/server.test.mjs`, `tests/solana/rehearsal.mjs`
      (one payout per run, books = wallets).

## Needs live systems (this workspace can't reach them)
- [x] **Apply `supabase/005_credits_plays.sql`** (done 2026-10-01, with 007 and 009; pools rows: see the devnet step) to the project (checked on real Postgres in `tests/db/`), then insert the two
      `pools` rows with the pools' real starting SANTA balances (smallest units, 6 decimals).
- [ ] **Apply `supabase/006_ranked_tickets.sql`** when ranked opens (checked on real Postgres, `tests/db/tickets.test.mjs`).
- [x] **Applied to the live database 2026-10-01: `supabase/008_hats_backpacks.sql`** (checked after; the site was then published) (avatar Hats/Backpacks + Ice Ball item rows, 7-slot
      `save_profile`). The page now shows those slots; without 008 a player saving a hat or backpack is refused. Safe for the live
      page too: a page that doesn't send the new slots saves them as "none". Tested: `tests/db/avatar-slots.test.mjs`.
- [ ] **Apply `supabase/007_rate_limits.sql` with `005`** (the speed limit's counts; the Edge Function needs the table:
      without it, counting fails, which lets every request through and logs "speed limit: counting failed").
- [ ] **Check the visitor's address on the live Edge Function:** the speed limit reads the FIRST `x-forwarded-for` entry
      (`server/http.js`). Send a request with a made-up `x-forwarded-for` and see what the function receives; if the made-up
      value comes first, pass `addressOf` in `index.ts` to read the entry Supabase adds. (Per-player limit is unaffected.)
- [ ] **Deploy the Edge Function** `supabase/functions/games/index.ts`. It imports `../../../server/*.js` and `../../../mockups/*.js`
      (include those files in the upload). Set `SOLANA_RPC_URL` (Helius; devnet URL for the test).
- [x] **Prove the pool row lock on real Postgres (done 2026-10-01):** `tests/db/lock.test.mjs` starts a throwaway real Postgres 16 server (needs
      Postgres installed; skips otherwise) and proves the pool lock, one quote = one run, two runs per player paid right, and
      overlapping payout workers.
- [ ] **Real wallet signing in the browser: write `window.santaPay(quote)`.** The page already calls it (server mode,
      `mockups/playcredits.js` → `payOnServer`) with the server's quote (it includes `mint`, `pool`, `fee`, `burnBps`).
      The transaction is ALREADY BUILT for you: `purchaseInstructions(lib, quote, walletSigner)` in `mockups/pay.js` (pass the
      `@solana-program/token-2022` module as `lib`), proven on the real token program and accepted by the server's checker
      (`tests/solana/pay.test.mjs`). Left: wrap Phantom as a @solana/kit transaction signer, sign + send, wait until FINALIZED,
      return the signature. Add `pay.js` to `deploy-pages.sh` when the page imports it.
- [ ] **Turn on server mode for real:** the page uses the server when opened with `?server=<Edge Function URL>`
      (`mockups/gameserver.js`); proven end to end locally (`tests/browser/server-mode-test.mjs`). For launch, make the
      Edge Function URL the default instead of the in-browser demo.
- [ ] **Start from the dress rehearsal:** `tests/solana/rehearsal.mjs` runs the whole devnet test locally (token, wallets, real
      signed purchases, plays, payouts + skims, admin stop/resume, books = wallets). Repeat its steps on devnet; the only stand-in
      is the "finalized transaction" record, which the RPC provides for real. Payout transactions MUST carry a unique memo
      (`Santa Hat payout #<id>`), as in the rehearsal's adapter; the worker refuses to reuse a signature.
- [ ] **Run the payout worker live:** `server/payouts.js` is built and proven on the real token program (never pays twice, even
      when it crashes before or after sending; `tests/solana/payouts.test.mjs`). Still needed: the live chain adapter (a Solana
      RPC: getLatestBlockhash, sendTransaction, getSignatureStatuses + isBlockhashValid; same shape as the test's), the pool
      wallets' keys in the worker's secrets only (never the site or repo), and a schedule (e.g. a Supabase cron every minute).
      **Runs may overlap safely** (fixed 2026-10-01: an overlapping run used to re-send a payout still being sent; now a worker
      only sends if its signature save wins, `tests/db/lock.test.mjs`). Keep that compare-and-set if you rewrite the worker.
- [ ] **Send skims on the chain:** `pool_transfers` rows (queued by every settle) must be sent like
      payouts: the worker in `server/payouts.js` has the exact shape (claim → sign → save signature → send → recover by chain status);
      skims go pool → treasury with the pool key. Until then the books run ahead of the wallets by design and reconcile says so.
- [ ] **Run the reconciliation on a schedule:** `server/reconcile.js` (books + everything still owed = wallet). Alarm on any drift;
      run it before any withdrawal. Needs the live wallet balances (RPC).
- [ ] **Store purchases through the server** aren't built yet (buying avatar items / tickets): prices and items now come from
      the game settings (`itemsWith()` in `mockups/settings.js`); the database `items` table must be kept in step with the
      published settings (seed from `itemsWith`) before item purchases are checked on the server.
- [ ] **Admin screen + emergency withdrawal:** the server side of the escrow controls is built (`server/admin.js`: pause, resume,
      set-rules; wallet-signed, replay-proof, logged) AND the admin screen is built: `admin.html?server=<Edge Function URL>`
      (published at /admin.html, not linked from the game; tested with a stand-in wallet, `tests/browser/admin-test.mjs`).
      Needed: the Edge Function secret `ADMIN_WALLETS` (Cody's address); a quick real-Phantom check of its Connect/sign; and the
      withdrawal itself (a transfer from a pool wallet to a safe wallet, needs the pool key, logged in `pool_log`). (Top-offs:
      Cody sends them himself and records them on the screen; built.) Pause first so a withdrawal isn't refilled by a top-off.
- [ ] **Two real devices** playing a multiplayer match; **a real phone** for feel, frame rate and sound.

## Checked here, re-check live
- [ ] Live SANTA price (DexScreener) and live tax (read from the token) show on the Games tab: worked from here on 2026-09-30.
- [ ] `tests/browser/live-games.mjs` against the published site after each publish.
