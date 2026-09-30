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
      shows exactly how it's made. The game reads the mint from `MINT` in `mockups/market.js`; point it at the devnet mint for the test.

## Needs live systems (this workspace can't reach them)
- [ ] **Apply `supabase/005_credits_plays.sql`** to the project (checked on real Postgres in `tests/db/`), then insert the two
      `pools` rows with the pools' real starting SANTA balances (smallest units, 6 decimals).
- [ ] **Deploy the Edge Function** `supabase/functions/games/index.ts`. It imports `../../../server/*.js` and `../../../mockups/*.js`
      (include those files in the upload). Set `SOLANA_RPC_URL` (Helius; devnet URL for the test).
- [ ] **Prove the pool row lock on real Postgres:** two connections settling plays on the same pool at the same moment. (Balances
      add/subtract so no SANTA can be lost either way; the lock keeps each play's "can the pool pay?" check on the latest balance.)
- [ ] **Real wallet signing in the browser: write `window.santaPay(quote)`.** The page already calls it (server mode,
      `mockups/playcredits.js` → `buyFromServer`): given the server's quote `{ id, kind, n, usd, santaRaw, expiresAt }`, build ONE
      transaction (burnChecked 10%-after-tax + transferCheckedWithFee to the pool wallet; amounts from `splitPayment` in
      `mockups/market.js`; exactly the layout proven in `tests/solana/split.test.mjs`), have Phantom sign and send it, wait until
      it's FINALIZED, and return its signature. The page then calls `buy`, and the server checks it (`server/verify.js`).
- [ ] **Turn on server mode for real:** the page uses the server when opened with `?server=<Edge Function URL>`
      (`mockups/gameserver.js`); proven end to end locally (`tests/browser/server-mode-test.mjs`). For launch, make the
      Edge Function URL the default instead of the in-browser demo.
- [ ] **Run the payout worker live:** `server/payouts.js` is built and proven on the real token program (never pays twice, even
      when it crashes before or after sending; `tests/solana/payouts.test.mjs`). Still needed: the live chain adapter (a Solana
      RPC: getLatestBlockhash, sendTransaction, getSignatureStatuses + isBlockhashValid; same shape as the test's), the pool
      wallets' keys in the worker's secrets only (never the site or repo), and a schedule (e.g. a Supabase cron every minute).
- [ ] **Two real devices** playing a multiplayer match; **a real phone** for feel, frame rate and sound.

## Checked here, re-check live
- [ ] Live SANTA price (DexScreener) and live tax (read from the token) show on the Games tab: worked from here on 2026-09-30.
- [ ] `tests/browser/live-games.mjs` against the published site after each publish.
