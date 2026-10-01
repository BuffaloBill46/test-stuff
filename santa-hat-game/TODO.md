# Santa Hat: what still needs doing

Kept up to date as things get done. Details for lobbies, economy and open questions live in `DESIGN_NOTES.md`.

## Launch checklist (2026-10-01): what stands between today and real SANTA on the Games tab
Details are in the sections below and in FOR_MAIN_CLAUDE.md. "Main Claude" = the session with wallets and live access.
1. **Cody:** legal check of the paid games (see RESEARCH.md → "Other things that would help"), pool + treasury wallets, Supabase settings.
2. **Main Claude:** devnet test token + pool wallets; apply `005` + `007`; deploy the Edge Function and set its secrets; check the visitor-address header.
3. **Main Claude:** real wallet payment in the page (`window.santaPay`); then make server mode the default on the Games tab.
4. **Main Claude:** payout worker, skim sending and the reconciliation check on a schedule; the emergency-withdrawal transfer.
5. **Everyone:** the dress rehearsal on devnet, end to end; then real phones (Phantom sign-in, feel).
6. **Publish** the site (`deploy-pages.sh`; the admin screen's bot box isn't live yet).
Not needed for that launch: ranked (tickets, referee server, matchmaking), levels, lottery, store purchases, wager, tournaments.
Cody's calls (2026-10-01): **DigitalOcean** for the always-on server (a new, separate Droplet); **Telegram alerts** via his
existing bot (frozen/failed payouts, books ≠ wallet, top-off waiting, server down, emergency stop, strong bot signals);
**Cloudflare Turnstile** at sign-in and when starting a ranked match; Helius $49 plan (confirm); no multisig. Details: FOR_MAIN_CLAUDE.
- [ ] **Telegram alerts** (Cody's bot; token + chat id as server secrets, asked for in the main Claude's session).
- [ ] **Turnstile at sign-in** (Supabase Auth's CAPTCHA setting) and **at ranked match start** (checked on the server before a ticket is held).


- [ ] **Turn on Solana sign-in:** Supabase → Authentication → Sign In / Providers → Web3 Wallet → Solana.
- [ ] **Set sign-in addresses:** Supabase → Authentication → URL Configuration. Site URL `https://buffalobill46.github.io/test-stuff/`, Redirect URL `https://buffalobill46.github.io/test-stuff/**`.
- [ ] **Email service so friends get sign-in emails:** connect Resend (free tier) to one of Cody's GoDaddy domains, then paste its SMTP settings into Supabase. Until then, email sign-in only reaches Supabase team members.
- [ ] **Level table:** how many rank points reach each level, and which items unlock at each.
- [ ] **Treasury wallet:** Cody is making a new one. Send Claude its public address (never the secret key or recovery phrase).
- [ ] **Lottery program:** when ready, share where Cody's on-chain lottery lives (its repo, or its program address on devnet) so the Store's Lottery block can link to it or plug into it.
- [ ] **Escrow admin controls (Cody, must exist before real pools go live):** for every pool wallet (Spin, Slots). *Built on the server (2026-09-30, `server/admin.js`, `tests/db/admin.test.mjs`):* wallet-signed emergency stop, resume and threshold/jackpot-% changes, no replays, sane-value checks, never mid-pull, all logged publicly. *Left for main Claude:* the admin screen (wallet signs the message) and the withdrawal transfer (needs the pool key). Jackpot odds stay a code change so old plays still re-check.
  - **Adjust thresholds** without a code change: starting amount, skim point and amount, top-off levels, jackpot % and odds. (The game logic already reads these from one settings object, `POOL_RULES`.)
  - **Emergency withdrawal:** move funds out of a pool to a safe wallet if something goes wrong.
  - **Emergency stop (pause):** stops play AND top-offs, so a withdrawal isn't instantly refilled. (Built and tested in the game logic; needs the admin screen and server.)
  - Only Cody can do these, confirmed with his wallet signature (not just a password). Every change and withdrawal is logged (what, when, amount, transaction) so players can trust the pools.
  - Prize and odds changes should be announced, and never happen mid-pull.
- [x] **Slots pool top-off** (Cody liked it): below $150 the treasury tops the pool up to $500, checked before and after every pull, so the game can't lock. Built and tested in the game logic; the real treasury transfer needs the server.
- [x] **Slots payouts decided** (Big Hat, 11 straight/diagonal lines, 100× top line, 6¢ hat bonus, 78.1% payback + the pool jackpot ≈ 80%: Cody's target, 2026-09-30). The live numbers are always in `PAYTABLE.md`; regenerate it with `node tests/paytable.mjs` after any change.

## Next to build
- [ ] **Levels for the new hats, backpacks and Ice Ball** (Cody is setting them; they're Store purchases until then).
- [ ] **Special snowball types from Cody's notes** (faster, bigger, longer stun, splits). The rules system and the first one (Ice Ball) are built: `catalog.js` `rules`, `sim.js`, `tests/iceball.test.mjs`. Ice Ball is a $0.50 Store item for now (Cody); open: whether special snowballs count in ranked.
- [ ] **Turn on ranked Auto match:** the FFA RANKED lobby is built, but its Auto match button stays off ("opening soon") until tickets and the server below exist.
- [x] **Auto match by rank points (logic built and tested, 2026-09-30):** `mockups/matchmaker.js`: ±50, then ±150, then any real players, bots at 30 s; 2–7 real, 1–3 bots (fills toward 6: Claude's pick), 3–8 total. `tests/matchmaker.test.mjs` (2 simulated hours of traffic). Runs on the server once it exists.
- [ ] **Ranked tickets:** 10 free a day (reset every 24 hours), spent when the match starts, refunded if you leave before. *Built and tested (2026-09-30):* `supabase/006_ranked_tickets.sql` (NOT applied), `tests/db/tickets.test.mjs`: hold on joining, spend at the start, release if you leave before; extras used after the free ones and never expire; 10 bought per rolling 24 hours. Needs the ranked referee server to call it.
- [ ] **Ranked payouts on the server:** 10 points per player in the pot (bots too); 3 or fewer players pays 1st only; 4+ pays 60/20/20; not placing costs −5; bots can win. *Rules coded and tested (2026-09-30):* `mockups/ranked.js`, `tests/ranked.test.mjs` (Claude's picks for ties etc. in DESIGN_NOTES). Needs the cheat-proof referee server to run for real.
- [ ] **Match history and stats:** ranked matches, podiums, and the Today / This week / Events leaderboard tabs.
- [ ] **Levels from rank points,** with items unlocking by level (needs the level table).

## Before anything paid goes live
- [ ] **Cheat-proof referee server:** today the host player's browser runs the match and could fake scores. Paid tickets and points need a server we control. Roughly $5–10/month, ask Cody before any spending.
- [ ] **SANTA payments:** USD prices paid in SANTA at the live price, with a quote locked for about a minute. *Built so far:* live price + live tax on the Games tab (`mockups/market.js`), server quotes (`server/games.js`).
- [x] **Where the Spin/Slots server runs (decided, Cody 2026-09-30): Supabase Edge Functions** (free plan: 500,000 calls a month). The multiplayer referee still needs an always-on server later (~$5–10/month, ask first).
- [x] **Stuck plays are tidied (built, 2026-09-30):** before each new play, that player's plays stuck for a minute are fixed: 'spent' (no secret yet) → refunded; 'open' (secret locked, the player's number never came) → finished with a server-made number and paid. `server/games.js` → `tidy`, tested in `tests/db/server.test.mjs`.
- [x] **Pool lock proven on real Postgres (2026-10-01):** `tests/db/lock.test.mjs` runs a throwaway real Postgres 16 server: 80 plays from 8 players settling at once all take turns (each sees the balance the play before it left); with the lock removed on purpose the same check fails and plays try to pay out more than the pool holds. Also proven there: one quote buys one run even with six payments racing, a player's two runs settled together are each paid once, and overlapping payout workers never pay twice (that last one found a real double-payment bug, fixed).
- [x] **SANTA price swings (decided, Cody 2026-09-30): the pools hold SANTA and float with the token price,** so the pool jackpot's dollar size floats too. Fixed prizes stay in dollars, paid in SANTA at the live price; pool rules (skim, top-off, cover the top prize) use the pool's live dollar value (Claude's reading).
- [ ] **Set up the Spin pool and Slots pool wallets (two separate):** keys only on the server, a little SOL each for fees. Each keeps everything (no sweeping). Real money: Cody funds them ($50 each). See DESIGN_NOTES → Pool wallets.
- [ ] **Security review of Cody's lottery program** before real SANTA goes into it on mainnet.
- [x] **SANTA's transfer tax in every payment (built and proven, 2026-09-30):** the live fee is read from the token by epoch (`market.js`, confirmed 3% on mainnet); the one-transaction burn + send split is proven on the real Token-2022 program (`tests/solana/split.test.mjs`): exact to the last unit, nothing lost, fee enforced, all-or-nothing.
- [ ] **Split every payment on-chain:** tickets and avatar items 50% burned / 50% to treasury; lottery 90% to winners / 10% burned.
- [ ] **Confirm payments on the server** (via Helius) before granting tickets or items. *Built:* the payment checker `server/verify.js` (12 cheating attempts refused, `tests/verify.test.mjs`); it needs a finalized transaction from Helius or any Solana RPC.
- [ ] **Ticket refill limit:** 10 extra per 24 hours.
- [ ] **Lottery:** daily and weekly draws, 90% to winners / 10% burned. Run by Cody's own on-chain lottery program (built, on devnet) or manually. This game doesn't build its own.
- [ ] **Buying needs a wallet:** email-only accounts must link one first (linking already works).

## Santa Hat Games tab
- [ ] **Spin pool skim:** when the Spin pool reaches $175, the server sends $25 to the treasury (decided).
- [x] **Snowball Drop in the arcade (2026-10-01):** a Games-tab card after Spin; prizes 10× · 5× · 1× · 0.4× · 0× (edges to middle, Cody), 78.4%; **shares the Spin pool**; **one dollar balance for 10¢ and $1 drops** (Cody: buy $10, play either size). Server and database steps built and tested. Preview page `/plinko.html` still there.
- [x] **Santa Hat Spin (demo built, 2026-09-30):** 3D prize wheel (pine-wreath rim, gold pegs, candy-cane flapper, Santa hat hub), 10¢/$1 chips, **two wheels since 2026-09-30 (Cody's option A): main 40 equal segments with 3 gold stars → bonus wheel of 12 (3×/4×/5×), pays back 80.0%** (Cody's ~80% target), own $50 pool with $25 skim at $175 and a top-off below $10, tap-to-land, 1× shown as "money back", celebrations for 2×+, odds legend, last-spins strip, full screen, wins feed the shared Recent winners list. Tests: `tests/spin.test.mjs`, `tests/browser/spin-test.mjs`. Real SANTA needs the server.
- [ ] **Slots with real SANTA:** server-picked reel stops (provably fair), payments and payouts. The game rules already take the random numbers from outside (`pull(state, 'big', rand)`), so server seeds plug straight in.
- [ ] **Slots pool jackpot %:** 25% (Cody) gives about $360–430 on a full pool; about 14% would give about $250. Cody to confirm.
- [x] **Provably fair results, in Cody's order (built, 2026-09-30):** `fair.js` + `house.js` (demo) and `server/games.js` (server). "Check this result" on the page. The pool safety rule (a play only starts if the pool covers that game's biggest fixed win: Spin 5× the bet, Slots its top fixed prize).
- [x] **Entries split 90% to the pool, 10% burned** *(done, ticked 2026-10-01: one transaction from the player, built by `mockups/pay.js`, checked by `server/verify.js`; proven on the real token program, `tests/solana/pay.test.mjs`)* (after the 3% tax).
- [x] **3% SANTA tax notice:** the Games tab intro covers Spin and Slots; each win message also says what arrives after the 3% tax.
- [ ] **Simulate a million spins** to prove the payback % before launch. (Slots: exact payback from the reel math plus `tests/payout-ranges.mjs`, 5 million pulls. Re-run both after any change.)
- [ ] More click games from the idea list (Hat Drop, Present Pick, Sleigh Climb, Advent Scratch, Naughty or Nice). Needs Cody's pick of game and its odds/payback first.

### Runs: buy 1, 5 or 10 plays that play straight away; winnings sent automatically (decided, Cody 2026-10-01)
Replaces play credits (2026-09-30). Each game has Play 1 / 5 / 10 at the size picked on the card; one confirm and one payment,
then the plays run; when the last one lands, the run's winnings are sent to the player's wallet in one transfer, with no claim
button and no player signature. **We never hold a player balance.** Rules and why: DESIGN_NOTES → "No credits".
- [x] **Demo built (2026-10-01):** the buttons, the confirm, auto-play with Skip ahead, the end-of-run summary, "Check this result". Tests: `tests/credits.test.mjs`, `tests/browser/games-test.mjs`, `spin-test.mjs`, `drop-test.mjs`.
- [x] **Server + SQL built (NOT deployed / applied):** `buy_run` makes the plays only after the payment is confirmed; `finish_run` queues ONE payout per run. Tests: `tests/db/server.test.mjs`, `credits-db.test.mjs`, `tests/solana/rehearsal.mjs`.
- [x] **The money moves at purchase (rule):** the single payment does the 10% burn / the rest to that game's pool (Spin and Drop: the Spin pool; Big Hat: the Slots pool). Price locked in dollars at purchase.
- [x] **Invariants tested as assertions** (demo ledger, real Postgres, real token program): a payment buys one run, once; a run is paid exactly once, exactly its winnings + refunds, never before its last play; a play the pool refuses after payment refunds its price into the run's payout.
- [ ] **Free daily spin:** a free run of 1 per player per day. Still needs Cody's yes (it costs real money from the Spin pool).

### Slots server: protect it from bots and abuse (no daily play limit, so this matters more)
The math can't be beaten by grinding (a simulated 100,000-pull grinder lost about 25% every time), but the server still has to
stop cheating and spam:
- [x] **One run at a time per player (built, 2026-09-30; corrected 2026-10-01):** a player can't get a new quote while a run is unfinished; stuck runs are finished by the server (`tidy`), so nobody is blocked forever. *Correction:* this is checked at the QUOTE only, not in the database. A player who gets two quotes before paying either can have two runs open. That's allowed on purpose: refusing a run that's already paid would keep the money and give no plays. Proven money-safe (`tests/db/lock.test.mjs`: each run paid once, exactly its winnings). It's a flood guard, not a money rule; quotes are capped at 30 an hour.
- [x] **Every payment used once.** *(Done, ticked 2026-10-01: the payment signature is unique in the database and buys one run; `tests/db/server.test.mjs`, `security.test.mjs`, `lock.test.mjs`.)* Each SANTA payment's transaction signature buys its run exactly once; record it and refuse repeats.
- [x] **Confirm the payment on-chain (Helius) before any plays are made.** *(Done in the server, ticked 2026-10-01: `buy` checks the FINALIZED transaction with `server/verify.js` before `buy_run` makes any plays. Needs the live RPC URL.)* No confirmed payment, no plays.
- [x] **Speed limit per player and per internet connection (built, 2026-10-01; NOT deployed):** `server/ratelimit.js`: 40 requests a player and 60 a connection per 10 seconds, then "slow down, try again in N seconds" (no ban). An honest run of 10 is about 12 requests; the real page peaked at 3 per player in 10 s. Counts in the database for now (`supabase/007_rate_limits.sql`, not applied). Tests: `tests/http.test.mjs`, `tests/db/ratelimit.test.mjs`, `tests/db/edge-limit.mjs` (the real Edge Function under Deno), the browser server-mode tests. Details: DESIGN_NOTES → "Speed limit".
- [ ] **Check on the live Edge Function which `x-forwarded-for` entry is the real visitor** (if a visitor can set it, a script could dodge the per-connection limit by faking addresses; the per-player limit still holds). FOR_MAIN_CLAUDE.
- [ ] **Move the speed limit to the always-on game server when it exists (Cody, 2026-10-01):** swap `dbStore(db)` for `memoryStore()` in the wiring (one line); 007's table is then unused. Only while one server program runs.
- [x] **Bot signals (built, 2026-10-01; NOT deployed):** the admin screen's "Check for bots" (wallet-signed, private, read only) lists players whose REACTION time (a run ending → their next quote) is clockwork-even or under 1 s (strong), or who play 4+ h without a break / 20+ of 24 h (weak). Signals only: nothing happens automatically. 900 simulated people never trip a strong signal; timer scripts do; a script with random waits isn't caught (honest limit). `server/bots.js`, `tests/bots.test.mjs`, `tests/db/bots-db.test.mjs`, `tests/browser/admin-test.mjs`. Thresholds are a first guess: re-tune on real play.
- [ ] **Results only from the server.** The page just animates what the server decided; the browser never picks outcomes or amounts.
- [x] **Payout safety cap that never holds a real win (built, 2026-10-01; Cody):** a run payout is frozen only above the most the run could possibly win from its prize table (`maxPerPlay`, `tests/payoutcap.test.mjs`).
- [x] **Frozen payouts + Release (built, 2026-10-01):** listed on the admin screen with the player and amount; a wallet-signed Release sends it on the next payout pass; logged.
- [ ] **Keys never leave the server;** pool wallets hold only what the rules need (pool + skim/top-off movements).

### Slots: tips for building it right (from the research, see RESEARCH.md)
- [ ] **Keep it a "PAR sheet" machine:** odds come only from symbol counts on the reel strips; change payback by changing counts or prizes in `mockups/slots.js`, then re-run `tests/slots.test.mjs`, `tests/paytable.mjs` and `tests/payout-ranges.mjs`.
- [x] **Provably fair, in Cody's order (done, ticked 2026-10-01; see the item above under the Games tab) (see DESIGN_NOTES → "Fair results: the order"):** payment confirmed
      FIRST; only then does the server make and lock a fresh secret for that play. Anyone can re-check a play afterwards.
- [x] **Show every win clearly:** draw the winning paylines, light the winning symbols, show the hat-bonus nickels, then the total.
- [x] **Only celebrate real wins:** big effects only when the pull pays more than the $1 it cost (research: "losses disguised as wins"). Small returns show quietly.
- [x] **Reel timing:** reels stop left to right with a small bounce; about 250–500 ms between stops; a slower last reel only when hats are really lining up (honest anticipation, nothing staged).
- [x] **Let players stop early:** tapping during a spin lands the reels right away (same result, just faster).
- [x] **Paytable always one tap away,** with the 3% tax note and the odds.

## Later
- [ ] Wager mode (players bet SANTA, FFA).
- [x] **Recent winners list shared across players (built, 2026-09-30):** the server's public `winners` action lists everyone's recent real wins (names only, never wallets); the page shows it in server mode. Tested in `tests/db/server.test.mjs` and `tests/browser/server-mode-test.mjs`. The demo still shows this browser's wins.
- [ ] Tournaments.
- [x] **Sound effects (2026-09-30):** made in code (`mockups/sfx.js`): sleigh bells, snow thumps, throws, knocks, reel clacks, wheel ticks, wins; mute button remembered. Test: `tests/browser/sfx-test.mjs`. Still to judge by ear on a real phone.
- [x] **Bots use emotes sometimes (2026-09-30):** 30% on a catch, knock or hit, at most once per 8 s per bot, no extra messages. Checked in `tests/sim.test.mjs`.
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
- **Big Hat slot machine rebuilt (demo, 2026-09-30):** one 5×5 machine (Mini Hat removed, no gold hatband), flat square reels, winning paylines drawn and squares framed, "+5¢" on every Santa Hat, full grid of hats for the pool jackpot, tap-to-stop, an honest slow-down when 3+ hats line up, celebrations only for wins over $1, **Full screen button**, total pool + pool-jackpot % and amount + $100 top prize, payout table with all 11 line diagrams, and a **Recent winners list** (shared by every Santa Hat game: name, amount, +%, game icon; demo shows this browser's wins).
- **Games tab + Santa Hat Slots (first demo, replaced)**: Mini Hat ($0.10) and Big Hat ($1.00) 3D machines shaped like Santa hats (pom-pom lever), stacked; total Slots pool under the title; each machine shows its jackpot % and amount; draft paytable; demo money only.
- Price cushion decided: 60-second quote, a payment counts if within 2%.
- 3% SANTA tax notice on the Play page intro, the Wager card and the Lottery block. Decided: winners absorb the tax.
- Unranked lobby (FFA or TEAM, Auto match into public games, private room code, practice) and the FFA RANKED lobby layout (Tournament greyed out, Coming soon).
- Live games list with Watch now: up to 4 watchers per game, who see the match but never play or count as players.
