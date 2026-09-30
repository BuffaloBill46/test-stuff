# For Cody's main Claude: what this workspace couldn't do

Kept by the Claude that built the game (cloud workspace, no wallets, no live connections, no real money). Everything here was
**left undone on purpose** because it needs something this workspace doesn't have. Read `HANDOFF.md` first, then this list.
Tick items off here as they're done. Order is roughly the order to do them in for a devnet test.

## Needs Cody (decisions, accounts, real money)
- [ ] **Supabase settings:** turn on Solana (Web3) sign-in; URL Configuration (Site URL `https://buffalobill46.github.io/test-stuff/`,
      Redirect `https://buffalobill46.github.io/test-stuff/**`); connect Resend for sign-in emails. (HANDOFF → Waiting on Cody.)
- [ ] **Pool wallets for the test:** a Spin pool and a Slots pool wallet (devnet first). Their PUBLIC addresses go in the Edge
      Function secrets `SPIN_POOL_WALLET` / `SLOTS_POOL_WALLET`. Until set, the server refuses all buying (built that way).
- [ ] **Treasury wallet address** (skims go there; top-offs come from it).
- [ ] **A devnet test token** with SANTA's settings (Token-2022, 6 decimals, 300 bps transfer fee). `tests/solana/split.test.mjs`
      shows exactly how it's made. Give the server its address with the Edge Function secret `SANTA_MINT` (no code change; unset
      = real SANTA). The page's live-price line still shows real SANTA's price and tax (`mockups/market.js`), which is fine for a test.

- [ ] **Cody: how top-offs are paid.** Top-offs move SANTA from the treasury into a pool. Sending them automatically would put the
      treasury's key on the server. Options: (a) Cody approves each one (default now: queued as `needs_approval` in
      `pool_transfers`, and the game keeps running on the books); (b) a small separate "top-off reserve" wallet whose key is on the
      server, holding only a few top-offs' worth (Claude's pick); (c) the treasury key on the server (not recommended).

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
- [ ] **Send skims (and approved top-offs) on the chain:** `pool_transfers` rows (queued by every settle) must be sent like
      payouts: the worker in `server/payouts.js` has the exact shape (claim → sign → save signature → send → recover by chain status);
      skims go pool → treasury with the pool key. Until then the books run ahead of the wallets by design and reconcile says so.
- [ ] **Run the reconciliation on a schedule:** `server/reconcile.js` (books + everything still owed = wallet). Alarm on any drift;
      run it before any withdrawal. Needs the live wallet balances (RPC).
- [ ] **Admin screen + emergency withdrawal:** the server side of the escrow controls is built (`server/admin.js`: pause, resume,
      set-rules; wallet-signed, replay-proof, logged). Needed: set the Edge Function secret `ADMIN_WALLETS` (Cody's address); a
      small admin page that builds the message with `adminMessage()`, has Cody's wallet `signMessage` it, and POSTs
      `{ wallet, message, signature (hex) }` with header `x-santa-admin: 1`; and the withdrawal itself (a transfer from a pool
      wallet to a safe wallet, needs the pool key, logged in `pool_log`). Pause first so a withdrawal isn't refilled by a top-off.
- [ ] **Two real devices** playing a multiplayer match; **a real phone** for feel, frame rate and sound.

## Checked here, re-check live
- [ ] Live SANTA price (DexScreener) and live tax (read from the token) show on the Games tab: worked from here on 2026-09-30.
- [ ] `tests/browser/live-games.mjs` against the published site after each publish.
