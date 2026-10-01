# For Cody's main Claude: what this workspace couldn't do

Kept by the Claude that built the game (cloud workspace, no wallets, no live connections, no real money). Everything here was
**left undone on purpose** because it needs something this workspace doesn't have. Read `HANDOFF.md` first, then this list.
Tick items off here as they're done. Order is roughly the order to do them in for a devnet test.

## Read first: everything that changed since the first hand-over (2026-09-30 evening → 2026-10-01)
All of it is committed, tested and live in the DEMO (no real money). Server/SQL parts are built and tested but NOT deployed.
Details of each decision: DESIGN_NOTES.md. Audit of the money changes: AUDIT.md → "Second pass"; saved reports: `audits/`.

**How players pay and get paid (the big one)**
- **No credits, no balances: RUNS** (Cody, 2026-10-01). Each game has Play 1 / 5 / 10 at the size picked on the card.
  One confirm → `window.santaPay(quote)` ONCE for the whole run → the plays run → the run's last play queues ONE payout to
  the player's linked wallet automatically. No claim button, the player never signs to be paid. Full SQL/server detail in
  the ticked item below. Sizes: Spin 10¢ or $1, Snowball Drop 10¢ or $1, Big Hat $1. Quote body: `{kind, n, bet}`,
  `kind` = `spin` | `drop` | `big`.
- **Removed server actions:** `credits`, `open` (runs replaced them) and the player `history` action ("My plays" was removed
  by Cody: players don't need it; every play stays in the `plays` table). Web door actions now: `quote`, `buy`, `settle`
  (signed in) and `pools`, `settings`, `winners` (public).
- **Payout cap → `held`:** a run payout above $205 × plays (+ jackpots) is saved with status `held` and the worker skips it.
  **Not built: a way to release it** (an admin action + a row on the admin screen), and the page's summary says "sent to
  your wallet" even then. Needed before real money; see the open item below.

**The games (numbers are Cody's calls; about 80% payback on every game because "we lose 16% to fees")**
- **Spin is two wheels:** main wheel 40 equal segments (0× 20, 1× 12, 2× 5, gold star 3) → a star spins the bonus wheel of 12
  (3× 9, 4× 2, 5× 1). Pays back 80.0%. Fair numbers: the 1st picks the main segment, the 2nd the bonus segment; the re-check
  replays both. Rules `mockups/spin.js`.
- **Big Hat:** hat bonus 6¢ per Santa Hat on the grid → 78.1% + the pool jackpot ≈ 79.5%. `PAYTABLE.md` regenerated.
- **Snowball Drop (Plinko) is a third game** on the Games tab (preview also at `/plinko.html`): 8 rows of fair 50/50 bounces
  (one fair number per row, < 0.5 = left), 9 equal presents paying 10× · 5× · 1× · 0.4× · 0× from the edges in; 78.4%.
  **It shares the Spin pool** (its payments go to the Spin pool wallet; game `spin` in `pools`). Guard rail: Spin's top-off
  must cover Drop's $10 top prize. Simulated 6 million mixed plays: never refused. Rules `mockups/plinko.js`.

**Server and admin**
- **Game settings are versioned and wallet-signed** (admin action `set-settings`, table `game_settings`): prices, both Spin
  wheels, Big Hat odds/prizes/symbols, jackpot % and odds, store items. Guard rails refuse unsafe changes; every run and play
  records the version it was bought/played on, so a change never lands mid-run and old plays re-check on their own odds.
  The admin screen has the editor. Logic `mockups/settings.js`.
- **Top-offs: Cody sends SANTA himself;** admin action `record-deposit` books what ARRIVED on the chain (ticked item below).
- **Price-pump guard:** plays are priced at the median of the last 10 minutes of once-a-minute samples
  (`server/price.js`, table `price_samples`). It samples itself when a quote comes in; no schedule needed.
- **Admin actions (all wallet-signed, replay-proof, logged):** `pause`, `resume`, `set-rules`, `set-settings`, `record-deposit`.
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
      to the player's linked wallet. No claim, no player signature. What changed in `005_credits_plays.sql` (still NOT applied;
      the file name is older than the design): no `credits` table; new `runs` (one per payment signature); `quotes.n` in 1/5/10
      with `usd = n × bet`; `plays.run_id` (required) and `plays.pay_raw`; `payouts.run_id` unique (was `play_id`); functions
      `buy_run`, `lock_play`, `settle_play` (no payout insert), `refund_play`, `finish_run(p_run, p_to_wallet, p_cap)`, with
      cap = 205 × plays + jackpots. The server refuses a quote up front when the player has an unfinished run, has no linked
      wallet, or the pool can't take the play; `tidy` finishes runs left behind (closed tab). The web door's actions are now
      `quote {kind, n, bet}`, `buy`, `settle` (`credits` and `open` are gone). The payout worker is unchanged: it sends whatever
      is queued, so a run's payout goes out on its next pass. Proven: `tests/db/server.test.mjs`, `tests/solana/rehearsal.mjs`
      (one payout per run, books = wallets).

## Needs live systems (this workspace can't reach them)
- [ ] **Apply `supabase/005_credits_plays.sql`** to the project (checked on real Postgres in `tests/db/`), then insert the two
      `pools` rows with the pools' real starting SANTA balances (smallest units, 6 decimals).
- [ ] **Apply `supabase/006_ranked_tickets.sql`** when ranked opens (checked on real Postgres, `tests/db/tickets.test.mjs`).
- [ ] **Deploy the Edge Function** `supabase/functions/games/index.ts`. It imports `../../../server/*.js` and `../../../mockups/*.js`
      (include those files in the upload). Set `SOLANA_RPC_URL` (Helius; devnet URL for the test).
- [ ] **Prove the pool row lock on real Postgres:** two connections settling plays on the same pool at the same moment. (Balances
      add/subtract so no SANTA can be lost either way; the lock keeps each play's "can the pool pay?" check on the latest balance.)
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
- [ ] **Release held payouts (NOT BUILT; needed before real money):** a run payout above the cap is saved as `held` and
      nothing sends it. Add a wallet-signed admin action (e.g. `release-payout` / `refuse-payout`, logged in `pool_log`) and a
      "held payouts" list on the admin screen; and in server mode, have the page's run summary say "waiting for a check" instead
      of "sent to your wallet" when the payout is held (`settle`'s last result would need to return the payout status).
- [ ] **Run the payout worker live:** `server/payouts.js` is built and proven on the real token program (never pays twice, even
      when it crashes before or after sending; `tests/solana/payouts.test.mjs`). Still needed: the live chain adapter (a Solana
      RPC: getLatestBlockhash, sendTransaction, getSignatureStatuses + isBlockhashValid; same shape as the test's), the pool
      wallets' keys in the worker's secrets only (never the site or repo), and a schedule (e.g. a Supabase cron every minute).
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
