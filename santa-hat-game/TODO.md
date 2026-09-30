# Santa Hat: what still needs doing

Kept up to date as things get done. Details for lobbies, economy and open questions live in `DESIGN_NOTES.md`.

## Waiting on Cody (settings only Cody can change)
- [ ] **Turn on Solana sign-in:** Supabase → Authentication → Sign In / Providers → Web3 Wallet → Solana.
- [ ] **Set sign-in addresses:** Supabase → Authentication → URL Configuration. Site URL `https://buffalobill46.github.io/test-stuff/`, Redirect URL `https://buffalobill46.github.io/test-stuff/**`.
- [ ] **Email service so friends get sign-in emails:** connect Resend (free tier) to one of Cody's GoDaddy domains, then paste its SMTP settings into Supabase. Until then, email sign-in only reaches Supabase team members.
- [ ] **Level table:** how many rank points reach each level, and which items unlock at each.
- [ ] **Treasury wallet:** Cody is making a new one. Send Claude its public address (never the secret key or recovery phrase).
- [ ] **Lottery program:** when ready, share where Cody's on-chain lottery lives (its repo, or its program address on devnet) so the Store's Lottery block can link to it or plug into it.
- [ ] **Escrow admin controls (Cody, must exist before real pools go live):** for every pool wallet (Spin, Slots):
  - **Adjust thresholds** without a code change: starting amount, skim point and amount, top-off levels, jackpot % and odds. (The game logic already reads these from one settings object, `POOL_RULES`.)
  - **Emergency withdrawal:** move funds out of a pool to a safe wallet if something goes wrong.
  - **Emergency stop (pause):** stops play AND top-offs, so a withdrawal isn't instantly refilled. (Built and tested in the game logic; needs the admin screen and server.)
  - Only Cody can do these, confirmed with his wallet signature (not just a password). Every change and withdrawal is logged (what, when, amount, transaction) so players can trust the pools.
  - Prize and odds changes should be announced, and never happen mid-pull.
- [x] **Slots pool top-off** (Cody liked it): below $150 the treasury tops the pool up to $500, checked before and after every pull, so the game can't lock. Built and tested in the game logic; the real treasury transfer needs the server.
- [ ] **Slots payouts:** Cody deciding, now that the machines are built. Replace `PAYTABLE` (and the jackpot %s in `MACHINES`) in `mockups/slots.js`, then run `tests/slots.test.mjs`. The starting pool must suit the biggest fixed win: with the draft's 20× top prize, $50 paused the Big Hat early in about 3% of simulated runs, $100 in none.

## Next to build
- [ ] **Turn on ranked Auto match:** the FFA RANKED lobby is built, but its Auto match button stays off ("opening soon") until tickets and the server below exist.
- [ ] **Auto match by rank points:** close ranks, then wider, then any real players, then bots at 30 seconds. At least 2 real players; 1–3 bots; 3–8 total.
- [ ] **Ranked tickets:** 10 free a day (reset every 24 hours), spent when the match starts, refunded if you leave before.
- [ ] **Ranked payouts on the server:** 10 points per player in the pot (bots too); 3 or fewer players pays 1st only; 4+ pays 60/20/20; not placing costs −5; bots can win.
- [ ] **Match history and stats:** ranked matches, podiums, and the Today / This week / Events leaderboard tabs.
- [ ] **Levels from rank points,** with items unlocking by level (needs the level table).

## Before anything paid goes live
- [ ] **Cheat-proof referee server:** today the host player's browser runs the match and could fake scores. Paid tickets and points need a server we control. Roughly $5–10/month, ask Cody before any spending.
- [ ] **SANTA payments:** USD prices paid in SANTA at the live price, with a quote locked for about a minute.
- [ ] **Set up the Spin pool and Slots pool wallets (two separate):** keys only on the server, a little SOL each for fees. Each keeps everything (no sweeping). Real money: Cody funds them ($50 each). See DESIGN_NOTES → Pool wallets.
- [ ] **Security review of Cody's lottery program** before real SANTA goes into it on mainnet.
- [ ] **Apply SANTA's transfer tax in every payment:** read the live fee from the token; tax first, then burn, treasury, pool; last split gets the remainder; no in-between wallets.
- [ ] **Split every payment on-chain:** tickets and avatar items 50% burned / 50% to treasury; lottery 90% to winners / 10% burned.
- [ ] **Confirm payments on the server** (via Helius) before granting tickets or items.
- [ ] **Ticket refill limit:** 10 extra per 24 hours.
- [ ] **Lottery:** daily and weekly draws, 90% to winners / 10% burned. Run by Cody's own on-chain lottery program (built, on devnet) or manually. This game doesn't build its own.
- [ ] **Buying needs a wallet:** email-only accounts must link one first (linking already works).

## Santa Hat Games tab
- [ ] **Spin pool skim:** when the Spin pool reaches $175, the server sends $25 to the treasury (decided).
- [ ] **Santa Hat Spin:** $0.10 and $1.00, its own Spin pool seeded with **$50**, the agreed odds (unchanged, no jackpot), a 400-slice wheel (5x = 2 slices, 4x = 4), pay per spin.
- [ ] **Slots with real SANTA:** server-picked reel stops (provably fair), payments and payouts. The game rules already take the random numbers from outside (`pull(state, 'big', rand)`), so server seeds plug straight in.
- [ ] **Slots pool jackpot %:** 25% (Cody) gives about $360–430 on a full pool; about 14% would give about $250. Cody to confirm.
- [ ] **Provably fair results** and a pool safety rule (a play only starts if the pool covers that game's biggest fixed win: Spin 5× the bet, Slots its top fixed prize).
- [ ] **Entries split 90% to the pool, 10% burned** (after the 3% tax).
- [ ] **3% SANTA tax notice at the top of the Spin page** when it's built (the Games tab intro already has one).
- [ ] **Simulate a million spins** to prove the payback % before launch. (Slots: exact payback from the reel math plus `tests/payout-ranges.mjs`, 5 million pulls. Re-run both after any change.)
- [ ] More click games from the idea list (Hat Drop, Present Pick, Sleigh Climb, Advent Scratch, Naughty or Nice).

### Slots server: protect it from bots and abuse (no daily play limit, so this matters more)
The math can't be beaten by grinding (a simulated 100,000-pull grinder lost about 25% every time), but the server still has to
stop cheating and spam:
- [ ] **One pull at a time per wallet.** A new pull waits until the last one is settled. No double-spending one payment.
- [ ] **Every payment used once.** Each SANTA payment's transaction signature can buy exactly one pull; record it and refuse repeats.
- [ ] **Confirm the payment on-chain (Helius) before the reels spin.** No confirmed payment, no pull.
- [ ] **Rate limit per wallet and per IP** (e.g. a few pulls a second at most) to stop scripted floods; slow down, don't ban, on the first hits.
- [ ] **Bot signals:** flag wallets pulling at perfectly regular intervals for hours; review before acting (a real grinder is fine).
- [ ] **Results only from the server.** The page just animates what the server decided; the browser never picks outcomes or amounts.
- [ ] **Payout queue with a sanity cap:** a single payout far above the biggest possible pull (about $205, or the pool jackpot) is held for Cody to review instead of sent automatically.
- [ ] **Keys never leave the server;** pool wallets hold only what the rules need (pool + skim/top-off movements).

### Slots: tips for building it right (from the research, see RESEARCH.md)
- [ ] **Keep it a "PAR sheet" machine:** odds come only from symbol counts on the reel strips; change payback by changing counts or prizes in `mockups/slots.js`, then re-run `tests/slots.test.mjs`, `tests/paytable.mjs` and `tests/payout-ranges.mjs`.
- [ ] **Provably fair:** the server commits to a hidden seed (publishes its hash), mixes in the player's seed and a pull counter, and derives the 5 reel stops. After a seed rotates, anyone can re-run it and check.
- [ ] **Show every win clearly:** draw the winning paylines, light the winning symbols, show the hat-bonus nickels, then the total.
- [ ] **Only celebrate real wins:** big effects only when the pull pays more than the $1 it cost (research: "losses disguised as wins"). Small returns show quietly.
- [ ] **Reel timing:** reels stop left to right with a small bounce; about 250–500 ms between stops; a slower last reel only when hats are really lining up (honest anticipation, nothing staged).
- [ ] **Let players stop early:** tapping during a spin lands the reels right away (same result, just faster).
- [ ] **Paytable always one tap away,** with the 3% tax note and the odds.

## Later
- [ ] Wager mode (players bet SANTA, FFA).
- [ ] **Recent winners list shared across players:** today it shows this browser's wins only; the real list needs the server (every settled win over the pull price, with name, amount, +% and game).
- [ ] Tournaments.
- [ ] Sound effects: catches, hits, landings, wind.
- [ ] Bots occasionally use emotes too, so they stay hard to spot.
- [ ] Merging two accounts that both have progress (linking refuses this today).
- [ ] Tune bot difficulty and the scoring and speed numbers after real play.
- [ ] Move to our own game server when real traffic arrives. The free Supabase plan carries roughly 70 full matches a month.

## Needs a real-world check (can't be tested from Claude's workspace)
- [ ] Two real devices playing a match together over the internet.
- [ ] Real Phantom wallet sign-in, and linking a real wallet to a real email.
- [ ] The game on a real phone at full speed (feel, controls, frame rate).

## Things to remember
- The free Supabase project **pauses after about a week with nobody playing**. Un-pause it from the Supabase dashboard.
- Publish updates with `santa-hat-game/deploy-pages.sh`.
- Handing over to a new Claude: see `HANDOFF.md`. Keep its "Where we are right now" section current.

## Done
- Four mockups; Snowball Square chosen and made multiplayer (rooms, codes, referee handover, idle kick).
- Play / Store / Avatar / Ranks tabs, the Santa hat logo, and the fur-trim theme.
- Wallet or email sign-in, avatars bound to the account, and email + wallet linking.
- Item catalog with 37 items, including the Gorilla, Snowman and Panda heads; save rules checked on the server.
- Bots with player names and random outfits; ranking rules written on the Play tab.
- **"How to win" button under the Big Hat (2026-09-30):** opens a panel with the rules in plain words, 7 winning examples (grids with the winning squares lit; prizes worked out by the real rules, so they can't drift) and a simple win table.
- **Big Hat slot machine rebuilt (demo, 2026-09-30):** one 5×5 machine (Mini Hat removed, no gold hatband), flat square reels, winning paylines drawn and squares framed, "+5¢" on every Santa Hat, full grid of hats for the pool jackpot, tap-to-stop, an honest slow-down when 3+ hats line up, celebrations only for wins over $1, **Full screen button**, total pool + pool-jackpot % and amount + $100 top prize, payout table with all 15 line diagrams, and a **Recent winners list** (shared by every Santa Hat game: name, amount, +%, game icon; demo shows this browser's wins).
- **Games tab + Santa Hat Slots (first demo, replaced)**: Mini Hat ($0.10) and Big Hat ($1.00) 3D machines shaped like Santa hats (pom-pom lever), stacked; total Slots pool under the title; each machine shows its jackpot % and amount; draft paytable; demo money only.
- Price cushion decided: 60-second quote, a payment counts if within 2%.
- 3% SANTA tax notice on the Play page intro, the Wager card and the Lottery block. Decided: winners absorb the tax.
- Unranked lobby (FFA or TEAM, Auto match into public games, private room code, practice) and the FFA RANKED lobby layout (Tournament greyed out, Coming soon).
- Live games list with Watch now: up to 4 watchers per game, who see the match but never play or count as players.
