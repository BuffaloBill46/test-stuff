# Mainnet launch checklist (2026-10-03, target ~10 hours)

## ⚠ Read first
- **This switches the paid games to REAL money.** Anyone with SANTA can play Big Hat, Snowball Drop and Stocking Stuffer for
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
   - **a. Key backup:** if the Droplet ever died, the pool's money would be stuck without a copy of its keys. Options:
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
- [ ] 1. Fund the wallets.  - [ ] 2. Cody's Phantom address.  - [ ] 6. GO.

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

## What Claude is doing meanwhile (no money involved)
- A security review of every money path, including the thin-market price question.
- A **safe switch-over script**. When the site switches, every leftover TEST item must be cleared, so none of it is ever paid
  out in real SANTA:
  - unpaid test winnings;
  - open lottery draws holding test tickets;
  - test pool balances;
  - store refunds and reward claims.
  It's tested on a copy of the database first, with a backup made just before.
- Mainnet settings staged on the Droplet (not switched on until GO).
- Rerunning the browser tests that failed today because the test machine was overloaded.

## At GO (Claude, ~15 minutes, step by step)
1. Back up the database.
2. Run the switch-over script.
3. Point the game server and payout worker at mainnet with the new wallets.
4. Record your deposits.
5. Make the public site use the server (no more demo).
6. Check that every book matches its wallet.
7. Your 10¢ dry run.
8. Announce.
