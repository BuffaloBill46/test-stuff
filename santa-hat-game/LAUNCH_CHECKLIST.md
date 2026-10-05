# Mainnet launch checklist (2026-10-03, target ~10 hours)

## ⚠ Read first
- **This switches the paid games to REAL money.** Anyone with SANTA or SOL can play Big Hat, Snowball Drop and Stocking Stuffer for
  real, and buy Store items, levels and lottery tickets.
- **Legal:** these are paid games of chance with real-value prizes. In many places that counts as regulated gambling.
  A lawyer's look before opening to the public is still recommended (RESEARCH.md). It's your call; Claude can't judge that.
- **Thin SANTA market:** the main pool holds only ~$32,000, with ~$13,000 traded a day. The game prices plays from it, so a big
  trade can swing prices for a few minutes. Claude is checking whether that can be abused before launch (see "Claude is doing").

## What only Cody can do (start now, any order)
1. **Fund the new wallets** (made on the Droplet today; the secret keys never left it):

   | Wallet | Address | Send |
   |---|---|---|
   | Game pool (all 3 games) | `4YGP9Zanq6WvJGk2AhvW8EQVviB5NdxrUrU18BzfjkWR` | **$500 of SANTA** (~1.51M SANTA at $0.000342; the token's 3% tax comes off on arrival) **+ 0.3 SOL** (fees, and opening winners' token accounts) |
   | Lottery wallet | `Fs9tuc4KohvorksFz6dQW851LPJdt6rXZsc4srFmWGF3` | **0.1 SOL** (no SANTA: ticket money fills it) |
   | Treasury | `FiP8mcq942jtSFm6BD83JtwhmAtRKUqCN86b4qf4QCVW` | **0.05 SOL** |
   | Old Slots pool | `95ufeEXgo2g7iFTUaMAyg6tj5nhE4e4LWp3RiH87oxbU` | **nothing** (unused since the shared pool) |

   - Total SOL ≈ 0.45 (~$54).
   - **Send a tiny test amount to each address first**, then the rest. After you send, tell Claude, who records the deposit
     (the books must match the wallet).
2. **Your Phantom's public address**, for the admin screen. That's the address only, never the secret phrase.
3. **The server's own Solana connection (Helius):**
   - Copy your Helius **mainnet** RPC URL from the Helius dashboard. It has your key in it.
   - Save it as a plain text file: `C:\santa-devnet-keys\helius-mainnet.txt`.
   - Claude moves that file onto the Droplet without displaying it. Claude never types or pastes keys anywhere.
   - The free public Solana servers refuse busy traffic, as today's tests showed.
4. **Alerts** (strongly recommended with real money: they tell you if the books ever stop matching the wallets):
   - In Telegram, message @BotFather → /newbot → copy the token.
   - Save it as `C:\santa-devnet-keys\telegram-token.txt`.
   - Send your new bot any message, so it can reply to you.
5. **Decisions:**
   - **a. Key backup:** (2026-10-05: Claude copied the 3 mainnet key files to Cody's PC, `C:santa-mainnet-keys`, verified
     identical to the Droplet's and that each secret makes its address; plus a WRITE THIS DOWN sheet per wallet. Cody is writing
     them down; then: lock the folder (7-Zip AES-256, his own password) or delete the unlocked copy.) The original options:
if the Droplet ever died, the pool's money would be stuck without a copy of its keys. Options:
     - DigitalOcean snapshot + an encrypted copy on your PC (recommended);
     - a snapshot only;
     - no backup.
   - **b. Ranked at launch:** it's paused, but the Store still sells ranked tickets. Either reopen ranked, or Claude hides
     ticket sales until you reopen it.
   - **c. Pool start:** $500, as decided (top-off below $200, $25 skim at $1,025)? Say if you want a different number.
6. **The final "GO"**, after Claude reports everything ready. Then **one 10¢ play with your own Phantom on mainnet** (the dry
   run). A win, if any, should arrive within a minute.

## Cody's items: progress
- [x] **3. Helius** (2026-10-03): Cody saved the URL to `C:\santa-devnet-keys\helius-mainnet.txt`. Claude moved the file to
  `/etc/santa/helius-mainnet.txt` without displaying it and filled `SOLANA_RPC_URL` in both `*.env.mainnet` files.
  go-mainnet checked that it answers and that it is Solana MAINNET (genesis hash).
- [x] **5. Backup** (2026-10-03, Cody's yes on the price): DigitalOcean live snapshot `santa-before-mainnet-2026-10-03`,
  2.56 GB, about $0.15/month. It includes the mainnet keys in `/etc/santa/keys-mainnet`. The site stayed up while it was taken.
  **Take another snapshot after GO**, so the backup holds the switched settings too.
- [x] **4. Telegram** (2026-10-03): new bot "Santa Hat Alerts" (@santahatgames_alerts_bot), created in BotFather on Cody's say-so.
  Cody saved the token; Claude installed it on the Droplet without displaying it (games.env and games.env.mainnet).
  The chat is remembered in alert_settings, which the reset keeps. A test alert arrived. Alerts now go to Telegram every 5 min.
- [x] **2. Phantom address** (2026-10-04): DpgDK31RNyA96qYoFgigjxxLScKBG3BAwdPeDfTCB7uN is an admin on the test server now and in
  games.env.mainnet. Cody: keep BOTH admins (his and the codyAdmin stand-in whose key is on Claude's PC, so Claude can test edits).
- [ ] **At GO: keep the TEST site on test money** (to-do #11, 2026-10-05). test.santahatgames.com sends /api to the game server
  on 127.0.0.1:8082 (Caddy). When that server switches to games.env.mainnet, first start a second, devnet game server (games.env,
  another port) and point the test site's /api at it, or the test site would play with REAL SANTA.
- [ ] 1. Fund the wallets.  - [ ] 6. GO (then one ~$1 purchase paid in SOL from Cody's Phantom, besides the 10¢ SANTA dry run).

## Final launch QA (2026-10-04)
- All unit and database tests, the full simulation: pass. Full browser suite: 36/36 (5 needed a rerun alone: load, not bugs;
  progress-or-test updated for 10 ticks).
- Live, devnet money: 5 test players played Snowball Drop, Stocking Stuffer and Big Hat 1,000 times each (30 real payments),
  0 errors, all 30 payouts sent, the Game pool's books = its wallet to the unit. 3 fresh players bought all 17 Store items once,
  3 levels, lottery tickets and the pass: 24/24, 0 refunds; ranked tickets refused while paused.
- Found and fixed: the books-vs-wallet alert fired falsely for payments on their way (Cody's Telegram, 59,274 SANTA MORE).
- Paying with SOL: checked on a private copy of mainnet (Surfpool, C:santa-tools): see HANDOFF.

## Done since the checklist was written (all live on the test network, tested)
- **Security review done**, every finding checked by Claude before acting on it. Fixed:
  - The old Supabase game server (still on test settings, writing to the same database) is shut. After the switch, test SANTA
    could have bought plays there that got paid in real SANTA.
  - The switch-over script clears every test record that could ever be paid out. It was rehearsed on a full copy of today's
    data (backup in `C:\santa-devnet-keys\backups`).
  - ~~No new runs while a pool top-off waits for your deposit.~~ **Turned off at Cody's request (2026-10-03):** a game that keeps
    stopping is worse. Games keep running. The Telegram alert "needs a TOP-OFF" tells you to deposit, and until you do, a payout
    could wait for that deposit (it retries and alerts; nothing is lost).
  - The pools' SOL can't be drained by players closing and reopening their SANTA account: the pool opens a winner's account at
    most once a day.
  - Prices: the server samples the SANTA price every minute and needs 5 samples before pricing a play, so a short pump does
    nothing.
  - Payouts double-check before re-sending (never pay twice).
  - No ranked tickets sold while ranked is paused. They go back on sale by themselves when you reopen it.
  - Alerts run their checks even before Telegram is set up (written to the server log).
- **Known, smaller, left for after launch** (no money is lost to these at launch size):
  - Lottery: someone could pump SANTA to buy tickets cheap. That only pays once a pot is in the thousands; a per-wallet ticket
    cap is next.
  - One payment could in theory count for a game AND a Store item at once. The pools still get their full amounts; only some
    of the 10% burn is skipped.
  - Store refunds owe back the full payment, including the burned half. You pay those by hand, so you can decline odd ones.
  - **Don't deposit much more than ~$1,000 into the Game pool.** Above about $4,800 the Drop jackpot makes Drop pay players more
    than they put in. Skims at $1,025 normally keep it well below that.
- **Built 2026-10-03 night, already in the live database (032–036 applied), nothing to do at GO:**
  - Seasons: the daily tasks and calendar, the **$2 season pass** (was $5; real money on mainnet: paid in SANTA like a Store item,
    100% to the treasury, nothing burned (Cody 2026-10-04); a second pass is owed back). Halloween (Pumpkin King) now, Thanksgiving (Gobbler) Nov 1.
  - The switch-over **clears every test season pass, reward and door** (fixed the same night; rehearsed).
  - Weekly modes: all four built, **all switched off** (admin screen → Weekly modes).
  - Found live and fixed: the Droplet stored JSON as text; season tasks, jackpot alerts and the jackpot banner now work
    (checked with a real live match and a real devnet pass purchase).

- **Built 2026-10-04, live on the test network (043–047 applied), nothing to do at GO:**
  - Pay with SOL (shows only once the server is on mainnet): exactly the price, swapped to SANTA in the same payment.
  - Levels take 10 ticks; match points: knock the hat off 10, catch the flying hat 25; the season pass 100% to the treasury.
  - Support tickets (Telegram + admin screen + Pending/Resolved for the player) and the @Santahatgame link.
  - The books-vs-wallet alert no longer fires for payments on their way.

## What Claude was doing meanwhile: all done (2026-10-04)
- Security review of every money path, and again of the new SOL payments (one gap found and closed).
- The safe switch-over script, rehearsed on a full copy of the data; it still clears everything added since (checked).
- Mainnet settings staged on the Droplet, Cody's Phantom in them; no placeholders left.
- The full test suite, a live 1,000-plays-per-game QA, every Store item bought live, and the SOL path on a copy of mainnet.

## LIVE (2026-10-05, ~12:55 UTC): Cody said GO
- [x] go-mainnet --go: backup /var/backups/santa/db-2026-10-05T12-54-42-636Z.json, test money cleared, mainnet settings, test site
  paused (503), services up, the server says mainnet.
- [x] Both Game pool deposits recorded: books 345,379.17 SANTA = the wallet.
- [x] LAUNCHED = true, main site published (build 2d3bd4b23e); fixed right after: the pool readouts now show the real pool on load.
- [x] Cody's real-money checks (2026-10-05, audited): Arcade 3 runs / 7 plays in SANTA (all 3 winnings sent, 1st try); Store 4 buys
  paid in SOL ($6, exact price; treasury +0.033175 SOL); lottery 7 tickets. Books = Solana to the unit: Game pool 342,585.70 SANTA,
  lottery 6,104.94 SANTA, treasury 0.083175 SOL. Next: announce.
- Watch: santa-launch-watch every 15 min through 2026-10-08.

## READY FOR GO (2026-10-05, while Cody napped): the exact steps
State: wallets funded (Game pool 345,379.17 SANTA ≈ $139 + 0.245 SOL; lottery 0.0295 SOL; treasury 0.05 SOL), keys backed up on
Cody's PC, `node go-mainnet.mjs` (check only) says **READY**. Pool rules are Cody's 2026-10-05 ones (code defaults): start $125, games
play down to $30, ONE top-off request back to $125 under $30, skim $25 above $1,025; payouts never give up.
1. Cody says **GO**.
2. Droplet: `cd /opt/santa/repo/santa-hat-game/worker && node go-mainnet.mjs` → READY, then `node go-mainnet.mjs --go`: stops game
   server + worker + alerts, backs up the database, clears test money, swaps to mainnet settings, **pauses the test site's game line
   (503)**, starts everything, opens the wallets' SANTA accounts, checks the server says mainnet and the test site answers 503.
3. Record the Game pool's two deposits (admin 'record-deposit', game 'spin'; signed with an admin wallet):
   - `2rnXwjonUddpdmcf79WkxtM781x6VHMJXdGJvxBEMx2NBLNHtX8iZG4huqh3dRjZSfwNnRz5n8V1om6ZcMdhPjUH` (344,350 SANTA)
   - `3tysAKA2FCXmVGhhwJdVCKkhdbSTbsGie3tvXyQ9ERKNvTycVLPQ3enD4ry9vZU4493RGZConcvHza56rF1AmsRY` (1,029.17 SANTA)
   Then books = 345,379.17 SANTA = the wallet (checked 2026-10-05: the two deposits add up to the wallet exactly).
4. `mockups/gameserver.js` LAUNCHED = true; commit; `bash deploy-pages.sh` (the main site plays for real; no more demo).
5. Check: `node watch.mjs` OK; books = wallet; the site shows the live SANTA price, real Store/Arcade, the SOL switch.
6. Cody: one 10¢ SANTA play from his Phantom, and one ~$1 purchase paid with SOL.
7. Extend the 15-minute watch (scheduled task santa-launch-watch) to 2 days after GO; tell Cody to keep the app open.
8. Announce (marketing/x-launch-posts.txt).

## At GO (Claude, ~15 minutes, step by step) — the original plan (2026-10-04)
1. Back up the database.
2. Run the switch-over script.
3. Point the game server and payout worker at mainnet with the new wallets.
4. Record your deposits.
5. Make the public site use the server (no more demo).
6. Check that every book matches its wallet.
7. Your 10¢ dry run with SANTA, and one ~$1 purchase paid with SOL from your Phantom (the SOL switch appears now).
8. Announce (the pinned post: marketing/x-launch-posts.txt).
