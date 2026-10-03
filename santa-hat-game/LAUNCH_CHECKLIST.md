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
