# For Cody's main Claude: what this workspace couldn't do

Kept by the Claude that built the game (cloud workspace, no wallets, no live connections, no real money). Everything here was
**left undone on purpose** because it needs something this workspace doesn't have. Read `HANDOFF.md` first, then this list.
Tick items off here as they're done. Order is roughly the order to do them in for a devnet test.

## Needs Cody (decisions, accounts, real money)
- [ ] **Supabase settings:** turn on Solana (Web3) sign-in; URL Configuration (Site URL `https://buffalobill46.github.io/test-stuff/`,
      Redirect `https://buffalobill46.github.io/test-stuff/**`); connect Resend for sign-in emails. (HANDOFF → Waiting on Cody.)
- [ ] **Pool wallets for the test:** a Spin pool and a Slots pool wallet (devnet first). Their PUBLIC addresses go in the Edge
      Function secrets `SPIN_POOL_WALLET` / `SLOTS_POOL_WALLET`. Until set, the server refuses all buying (built that way).
- [ ] **Treasury wallet address** (skims go there; top-offs are paid by Cody from any wallet he likes).
- [ ] **A devnet test token** with SANTA's settings (Token-2022, 6 decimals, 300 bps transfer fee). `tests/solana/split.test.mjs`
      shows exactly how it's made. Give the server its address with the Edge Function secret `SANTA_MINT` (no code change; unset
      = real SANTA). The page's live-price line still shows real SANTA's price and tax (`mockups/market.js`), which is fine for a test.

- [ ] **Cody: payback level and Spin's dry runs** (see FOCUS_GROUP.md): 74.5–75.5% vs 85–97% on real slots; 36 of 100 simulated
      players went 15+ plays without a real win. If he changes odds, re-run `tests/spin.test.mjs`, `tests/slots.test.mjs`,
      `tests/paytable.mjs` and the pool simulations before launch.
- [x] **Decided (Cody, 2026-09-30): Cody pays top-offs himself** by sending SANTA to the pool wallet. Built: a top-off waits in
      `pool_transfers` as `needs_approval` (admin screen: "waiting for your deposit" + how much to send, tax included); Cody pastes
      the transaction signature → `record-deposit` (`server/admin.js`) reads what ARRIVED from the chain, marks top-offs paid, adds
      any extra to the pool (tested on real Postgres with books = wallet at every step, `tests/db/admin.test.mjs`). No key needed.
      Left for you: check it once with a real devnet deposit (the Edge Function already passes its `chain` to the admin).

## Needs live systems (this workspace can't reach them)
- [ ] **Apply `supabase/005_credits_plays.sql`** to the project (checked on real Postgres in `tests/db/`), then insert the two
      `pools` rows with the pools' real starting SANTA balances (smallest units, 6 decimals).
- [ ] **Apply `supabase/006_ranked_tickets.sql`** when ranked opens (checked on real Postgres, `tests/db/tickets.test.mjs`).
- [ ] **Deploy the Edge Function** `supabase/functions/games/index.ts`. It imports `../../../server/*.js` and `../../../mockups/*.js`
      (include those files in the upload). Set `SOLANA_RPC_URL` (Helius; devnet URL for the test).
- [ ] **Prove the pool row lock on real Postgres:** two connections settling plays on the same pool at the same moment. (Balances
      add/subtract so no SANTA can be lost either way; the lock keeps each play's "can the pool pay?" check on the latest balance.)
- [ ] **Real wallet signing in the browser: write `window.santaPay(quote)`.** The page already calls it (server mode,
      `mockups/playcredits.js` → `buyFromServer`) with the server's quote (it includes `mint`, `pool`, `fee`, `burnBps`).
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
