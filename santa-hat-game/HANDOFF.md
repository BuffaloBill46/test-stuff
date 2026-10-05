# HANDOFF: start here

If you are a new Claude picking this project up, read this page first, then the files it points to.
It's written so you can take over mid-stream with no other context. **Keep it current:** update the
"Where we are right now" section at the end of every working session, in the same commit as the work.

## The project in one paragraph

**Santa Hat Legends** (called Santa Hat Arcade until 2026-10-01) is a free browser game for the Solana token $SANTA (brand site santahat.gold). The
main game is **Snowball Square**: up to 8 players (real people plus bots) in a snowy low-poly plaza throw
snowballs and fight over a giant Santa hat, in FFA or TEAM mode. Around it is a small site with tabs:
**Play** (lobbies, ranked and unranked), **Store** (items priced in USD, paid in SANTA; buying not built
yet), **Avatar** (dress-up editor, saved to your account), **Ranks** (leaderboard). **Games** (single-player
Santa Hat Spin and Big Hat slots; built as demos, no real money yet).

**Cody** is the creative director: non-technical, makes every design, economy and tone call. **Claude** is
the only builder. Read `/CLAUDE.md` (repo root) for how we work together. Short version: work
autonomously, plain English, commit after every real change, surgical edits, **never spend real money or
touch real funds without Cody's OK**, never delete code that only *looks* dead, no subagents unless asked.

## Read these, in this order

| File | What it's for |
|---|---|
| `/CLAUDE.md` | How Cody and Claude work. Required. |
| `santa-hat-game/LESSONS.md` | Bugs that bit us and rules that must not drift. Required before any change. |
| `santa-hat-game/TODO.md` | The live task list: what's waiting on Cody, what's next, what's done. |
| `santa-hat-game/DESIGN_NOTES.md` | Every design and economy decision Cody has made (lobbies, prices, burn splits, Spin odds, pools, limits). |
| `santa-hat-game/MULTIPLAYER_PLAN.md` | How multiplayer works and the free-plan message budget. |
| `santa-hat-game/RESEARCH.md` | Brand and visual research (the look we're matching). |
| `santa-hat-game/FOCUS_GROUP.md` | 100 simulated players (real game math + real walkthroughs; opinions are simulated): findings, fixes, decisions for Cody. |
| `santa-hat-game/AUDIT.md` | The audits (2026-09-30, and a second pass for runs on 2026-10-01): what was found, what was fixed, what's left. |
| `santa-hat-game/audits/` | Saved audit reports and screenshots, one dated folder each (the test robots' own `out/` folders aren't kept in git). Index: `audits/README.md`. |
| `santa-hat-game/FOR_MAIN_CLAUDE.md` | What this cloud workspace couldn't do (wallets, live deploys, real money). For the devnet move. |

## Where things live

- **Branch:** `claude/test-stuff-section-egujzy` (Cody's main Claude, on his Windows machine). The cloud session's
  `ccr-55527f21-p10a6h` was merged into it on 2026-10-01, so it contains everything; publish only from it. The repo is public: `buffalobill46/test-stuff`.
- **Live site:** https://buffalobill46.github.io/test-stuff/ served from the `gh-pages` branch.
  Publish with `santa-hat-game/deploy-pages.sh` (run from anywhere in the repo). It copies `online.html` as
  `index.html` plus the game's JS files. **If you add a new JS file the page imports, add it to that script too.**
- **Game code:** `santa-hat-game/mockups/`. Plain ES modules, no build step, Three.js r186 from jsdelivr.
  - `online.html` / `online.js`: the site shell, lobbies, rooms, in-game UI, hosting and watching.
  - `tabs.js`: Store, Avatar and Ranks pages, sign-in sheet, account linking.
  - `sim.js`: the match referee (pure logic, no graphics). Runs in the host player's browser for now.
  - `net.js`: all networking and accounts (Supabase rooms, games board, sign-in). `?net=local` swaps in
    one-computer stand-ins for testing.
  - `catalog.js`: every avatar item (slot, level or price).
  - Arcade tab: `games.js` (Big Hat), `dropui.js` / `plinko.js` (Snowball Drop), `stockingui.js` / `stocking.js` (Stocking Stuffer),
    `gamepool.js` (the demo Game pool), `celebrate.js` (win tiers), `slots3d.js` (3D). Santa Hat Spin was REMOVED 2026-10-04.
  - Snowball Drop: `plinko.js` (rules), `plinkoboard.js` (the board), `dropui.js` (its Games-tab card); preview `plinko.html`.
  - Runs (buy 1/5/10 plays, or any number up to 100 from the box, that play straight away) and fair results: `credits.js` (the run ledger; the file name is older
    than the design), `fair.js` (secrets, fingerprints, numbers), `house.js` (Cody's order; a stand-in for the server),
    `playcredits.js` (the buy confirm, playing a run, "Check this result"), `runui.js` (the end-of-run summary).
  - `market.js`: live SANTA price and the token's live tax (read-only), plus the payment split math. `sfx.js`: sound effects.
  - `matchmaker.js`: ranked Auto match logic (not switched on yet).
- **Server code (NOT deployed):** `santa-hat-game/server/`: `verify.js` (is this transaction a valid payment?), `games.js`
  (quote → buy a run → settle each play → one payout per run, plus tidying stuck runs) and `http.js` (the web door: sign-in, our website only).
  It runs as the Supabase **Edge Function** `supabase/functions/games/index.ts` (Cody's choice; thin wiring, type-checked with Deno
  `deno check` (it had been failing unnoticed until 2026-10-01; re-run it after any server change) and run for real against a
  real Postgres by `tests/db/edge-limit.mjs`: `npm install deno` gives a runnable Deno). `ratelimit.js`: the speed limit. Pools hold SANTA and float with the price (Cody).
  - `kit.js` / `plaza.js`: the low-poly art kit and the plaza scene.
  - `snowball.js`, `bethehat.js`, `sleigh.js`, `hatchase.js`, `village.js`, `index.html`: the four
    original single-player mockups (published under `/mockups/`). **Not dead code; keep them.**
- **Database:** `santa-hat-game/supabase/001..004_*.sql` and `008` are applied to the live project.
  **`008_hats_backpacks.sql` IS applied** (2026-10-01: avatar Hats/Backpacks + Ice Ball items, 7-slot save_profile).
  **`007_rate_limits.sql` applied live 2026-10-01** (the speed limit's counts).
  **`005_credits_plays.sql` applied live 2026-10-01** (Cody's OK; runs, plays, payouts; despite the name, no credits), verified identical to the file; **`009_lock_my_plays.sql` applied right after** (AUDIT #11). `006` (ranked tickets) is still NOT applied.
  New changes go in a new numbered file, checked with `tests/db/`, applied with the Supabase tools, then committed.

## Services and access

- **Supabase project** `santa-hat-arcade`, ref `olganobdypnxfpmsxibe`, URL `https://olganobdypnxfpmsxibe.supabase.co`,
  free plan (org `gxrifjumthwfgglyyxdz`). The publishable key is already in `net.js`. That's safe, it's meant
  to be public. **Never put a secret or service-role key in the site.** Database rules (row security and
  the `ensure_profile` / `save_profile` / `redeem_link_code` etc. functions) guard everything.
- To change the database you need the **Supabase connector** on Cody's Claude account (it was used for
  everything so far). GitHub access comes through the Claude GitHub app.
- The free project **pauses after about a week unused.** Un-pause it from the Supabase dashboard.
- **SANTA has a 3% transfer tax** built into the token. Every payment design must account for it (DESIGN_NOTES → SANTA's 3% tax).
  Winners absorb it, and it must be stated on the Play page and at the top of every SANTA game's description.
- **Pool wallets:** a Spin pool and a separate Slots pool (keys only on the server), plus a new treasury wallet Cody is making. The
  lottery is server-run with its own lottery wallet (Cody, 2026-10-01; DESIGN_NOTES → "Santa Lottery"). None of these are hooked up yet.
- **Escrow admin controls are a must before any real pool goes live:** adjustable thresholds, emergency withdrawal, and an
  emergency stop (see TODO). The game logic already reads all thresholds from `POOL_RULES` and supports the stop switch.
- Money: nothing paid is live. No wallet has ever been charged. Keep it that way until Cody signs off.

## How to test (run these before you call anything done)

```bash
cd santa-hat-game
node tests/sim.test.mjs          # referee: 120 simulated matches, rule checks, cheating attempts
node tests/catalog-sql.mjs       # item catalog checks (and prints the SQL seed)
node tests/tax-split.mjs         # SANTA 3% tax split examples and pool simulation
node tests/jackpot-sim.mjs       # jackpot = % of pool: level-off point, never below zero
node tests/spin.test.mjs         # Spin rules: exact wheel odds, pool, skim, top-off
node tests/slots.test.mjs        # Slots rules: exact wild-aware payback, every line, pool never negative, skim
node tests/paytable.mjs          # regenerates PAYTABLE.md (the full payout table) from mockups/slots.js
node tests/slots-tune.mjs        # tuning helper: scales prizes to a payback target
node tests/credits.test.mjs      # runs + fair results: Cody's order on every play, one send per run, refunds on failure
node tests/market.test.mjs       # live price + live token tax (reads mainnet; skips politely if offline)
node tests/verify.test.mjs       # server payment checker: a good payment passes, 12 cheats refused
node tests/matchmaker.test.mjs   # ranked matchmaking rules, 2 simulated hours of traffic
node tests/ranked.test.mjs       # ranked points: the Play page's rules as code (pot, places, ties, −5)
node tests/http.test.mjs         # the server's web door: sign-in, other websites refused, plain errors
(cd tests/solana && node payouts.test.mjs)  # payout worker: winners paid exactly once, even through crashes
(cd tests/browser && node server-mode-test.mjs)  # the Arcade page playing through the real server code + real SQL
(cd tests/db && node admin.test.mjs)            # escrow admin controls: wallet-signed only, no replays, stop really stops
(cd tests/db && node tickets.test.mjs)          # ranked tickets: 10 free a day, held/spent/released, 10 bought per 24 h
(cd tests/db && node security.test.mjs && node price.test.mjs)  # audit: attacks refused cleanly; price manipulation guard
(cd tests/db && node lock.test.mjs)             # locks on a REAL Postgres server: plays take turns, payouts never sent twice
node tests/iceball.test.mjs     # special snowballs: Ice Ball stuns 50% longer, kept through a host handover
(cd tests/db && node avatar-slots.test.mjs)     # hats and backpacks save rules (008)
node tests/bots.test.mjs        # bot signals: 900 simulated people never strong; timer scripts caught
(cd tests/db && node bots-db.test.mjs)          # bot signals through the admin door: private, read only
(cd tests/db && node ratelimit.test.mjs)        # speed limit counts: same rules in memory, PGlite and real Postgres (200 at once)
(cd tests/db && DENO=<path>/deno node edge-limit.mjs)  # the REAL Edge Function under Deno: flood → 60 answered, then 429
node tests/reconcile.test.mjs    # audit: books + everything owed = wallet
(cd tests/browser && node audit-ux.mjs)          # audit: every tab at 5 screen sizes (tap size, contrast, overflow, dialogs)
(cd tests/solana && node pay.test.mjs)          # the page's purchase transaction, on the real token program
(cd tests/solana && node rehearsal.mjs)         # DRESS REHEARSAL of the devnet test: buy, play, pay out, admin, books = wallets
(cd tests/browser && node admin-test.mjs)       # the admin screen: connect, Stop, bad setting refused, save, Resume, game settings editor
node tests/settings.test.mjs     # game settings: version 0 = today exactly; guard rails; changes do what they say
(cd tests/db && node settings-db.test.mjs)      # settings on the server: never mid-play, old plays re-check, runs keep their price
(cd tests/browser && node settings-mode-test.mjs)  # the page draws published settings; plays land and re-check on them
node tests/levels.test.mjs       # levels: Cody's table exactly; 10 top-3 finishes per level, 9→10 = 10 first-place wins; buy to 5 ($8)
(cd tests/db && node levels-db.test.mjs)        # levels in the database + the server's progress/finish actions; database = levels.js
(cd tests/browser && node controls-test.mjs)    # phone controls: joystick only moves, any other tap throws; zoom; whole ring reachable (slow: ~30 min)
(cd tests/solana && node chain.devnet.mjs)      # REAL devnet: the payout worker's live adapter, crash cases, never pays twice
(cd tests/solana && node devnet-setup.mjs)      # REAL devnet: makes/tops up the test token and wallets (keys in C:\santa-devnet-keys)
# On Windows: tests/solana, tests/browser and the real-Postgres db tests run inside WSL (see LESSONS for the exact commands).
cd tests/solana && npm install && node split.test.mjs   # the payment split on the REAL Token-2022 program (LiteSVM, no network)
cd tests/db && npm install && node credits-db.test.mjs && node server.test.mjs  # the SQL + server steps on real Postgres (PGlite)
cd tests/browser && npm install  # once per fresh machine
node lobby-test.mjs              # 3 browser windows: auto match, join from list, Watch now
node tabs-test.mjs               # tabs, store, avatar editor, sign-in sheet
node link-test.mjs               # email + wallet account linking (local stand-in)
node mp.mjs                      # multiplayer room: join, host handover
node idle.mjs                    # 3-minute idle and hidden-tab kicks
# A REAL PLAYER on the LIVE site (real Chrome on Windows = real GPU; guest; desktop, then phone with touch): a full practice
# match, Auto match, Games, Store/lottery, Avatar, Ranks, Sign in. Needs playwright on Windows (PW=<folder>); SITE=… for local code.
# 2026-10-02: 33/33 desktop and phone on the live site; tonight's code 33/33 with no console errors.
(cd tests/browser && PW=<folder with node_modules/playwright> node live-player.mjs [phone])
node live.mjs                    # STALE (found 2026-10-01): written before the lobby redesign; it stops at "Waiting for the referee" (it blocks Supabase). Until it's updated, click through the live site in a real browser instead
node spin-test.mjs               # RETIRED with Spin (Cody, 2026-10-01): the Spin card is hidden, so this no longer runs; kept with Spin's code
node devnet-pay-test.mjs         # REAL devnet: the page's wallet step buys a Snowball Drop run, server checks the real payment, payout sent (needs tests/solana/devnet-setup.mjs)
node games-test.mjs              # Arcade tab: Slots readouts, pulls, forced win and jackpot, money math
node sfx-test.mjs                # sound: waits for a tap, fires at the right moments, mute remembered
node live-games.mjs              # buys + pulls + spins + re-checks a result on the PUBLISHED Arcade tab
```

The browser tests need Playwright installed globally and use headless Chromium with software graphics
(about 8 fps, slow motion; fine for logic, not for judging feel). They run the game with `?net=local`, so
several windows on one computer share a room. Screenshots land in `tests/browser/out/` (not committed).
`shot.mjs` + `steps-*.mjs` screenshot the old mockups; `faces.mjs` renders every face with the hat on;
`logo.mjs` re-renders `hat-logo.png`; `humanscore.mjs` checks scoring.

**Blind spot:** Claude's cloud workspace can't open live WebSocket connections, so real Supabase multiplayer
between two devices has never been tested from here. Cody and friends testing on real phones is the check.

## Where we are right now

**Naming (Cody, 2026-10-04): the Games tab is now the ARCADE** (nav bar, page heading "Santa Hat Arcade", guide). Code keeps its
internal names (#tab-games, data-tab="games", the #games link) so links and tests don't break. Docs say Arcade from here.

### 2026-10-04 (NEWEST): TODO #9, #10, #10b DONE (site published, build after 20ce85b)
- Money flow chart: docs/money-flow.png (source docs/money-flow.html; render it with a small Playwright script, see git c6701cb).
- Bottom of every page (mockups/sitefoot.js; game page under every tab, and the guide): How to get SANTA, @Santahatgame, Support,
  v1.0 (+ build id), (c) 2026 Santa Hat Legends. Raise VERSION in sitefoot.js for a real release.
- "How to get SANTA" pop-up (footer, sign-in sheet, or santahatgames.com/#get-santa): wallet, SOL, swap (real address + Copy +
  Jupiter link), sign in. Pay-with-SOL line and the live coin tax show on mainnet only (from the server's 'market').
  #support opens the Support form (the guide's Support uses it). Test: getsanta-test.
- Next on TODO: #11 staging site (needs Cody's DNS record), #12 Jupiter address fix, #14 ranked points by level.

### 2026-10-04: X LINK + SUPPORT (046 live; servers bd7d0e8)
- Sign-in sheet bottom: @Santahatgame (x.com/Santahatgame) with a Support button beside it (supportui.js). Anyone, signed in
  or not, demo site too, sends what happened + optional contact; server/support.js keeps it (support_messages, private) and
  Cody's Telegram alerts bot sends it at once; 5/hour per connection or player. Admin screen: Support messages (open first,
  Mark resolved + a note THE PLAYER SEES, admin-wallet-signed). Tickets (047, servers 48cfff3): each message is ticket #N;
  under Support the player sees theirs: Pending, then Resolved + Cody's note; resolved ones have an x to clear (none on
  pending). Guests follow theirs by a secret code their browser keeps (fingerprint only in the DB); signed in, on any device.
  Live test: support #1 (a labeled test, sent before tickets; mark it resolved).

### 2026-10-04: FINAL LAUNCH QA + MATCH POINTS + ALERT FIX (servers live; see LAUNCH_CHECKLIST "Final launch QA")
- Match points (Cody): knock the hat off 10, catch the flying hat 25 (were 25, 50). sim.js PTS; pop-ups read it. Live.
- Live devnet QA: live-games-qa.mjs (5 players, Drop/Stocking/Big Hat 1,000 plays each, 30 real payments, 0 errors, payouts
  all sent, pool books = wallet to the unit); live-store-qa.mjs (3 fresh players: all 17 items, levels, lottery, pass: 24/24).
- Telegram "wallet has MORE" alerts were payments on their way, not missing money; reconcile now allows open quotes' amount.
- SOL QA on a private copy of mainnet: Surfpool 1.6.0 in C:\santa-tools\surfpool (Cody OK'd the download). Start it with the
  Helius URL from the key file as SURFPOOL_DATASOURCE_RPC_URL (never echo it), `surfpool start --ci --no-deploy -q 0`; then
  tests/browser/fork-sol-qa.mjs [runs per game]. Full run: 45/45 purchases, 3,300 plays (1,000 of each game in SOL), 33/33 payouts,
  every money check exact. A first SOL buyer pays Solana's refundable account deposits ONCE (~0.0042 SOL, ~50c: their SANTA
  account + sometimes one for a swap's in-between token), then exactly the price every time (Cody asked; confirmed).
- Security: SOL payments refuse SANTA moved in by a wallet that signed (verify.js S1b).
- HELIUS KEY: printed once into a local test log by a Surfpool error (deleted; never committed/sent). Cody 2026-10-04: no
  rotation needed ("if you deleted it, it's fine"). The test now cuts addresses out of every error.
- Admins: Cody's Phantom + the codyAdmin stand-in, on devnet and in games.env.mainnet (his call: keep both).
- X: logo + banner (marketing/brand), launch posts + bios (marketing/x-launch-posts.txt), Frost King still (marketing/stills/char-2).

### 2026-10-04: CODY'S PHANTOM IS AN ADMIN (server /etc/santa/games.env ADMIN_WALLETS, backup kept beside it)
- ADMIN_WALLETS = the codyAdmin stand-in (3jRok1…, key in C:\santa-devnet-keys, so Claude can test admin edits) AND Cody's own
  wallet DpgDK31RNyA96qYoFgigjxxLScKBG3BAwdPeDfTCB7uN. Cody 2026-10-04: "keep both wallets as admin". Checked live: his wallet
  passes the admin-wallet check (a fake signature then stops at the signature check); a stranger's is refused.

### 2026-10-04: PAY WITH SOL BUILT + TESTED (044+045; see the line below for the price rule). SHOWS ONLY ON MAINNET.
- One approval either way. Switch "Pay with: Auto / SANTA / SOL" (paywith.js, remembered; Store + under each game; hidden on
  devnet). Auto = SANTA if the wallet has enough, else SOL. Games/lottery: Jupiter swaps SOL->SANTA in the same transaction,
  then burn + pool as usual. Store: swap only the burn half, burn it, the rest to the treasury AS SOL (quote.solLamports,
  044). Pass: plain SOL transfer. Server check: verify.js (a payment whose SANTA went UP = paid with SOL; quote must be covered).
- PRICE RULE (Cody 2026-10-04, 045): a SOL payer pays EXACTLY the price in SOL; swap fees come out of what ARRIVES (the house
  absorbs them): ~90% of the SANTA reaches the pool/burn today. Store: exactly 50% of the price swapped + all burned, 50% to the
  treasury as SOL. Server refuses a SOL payment not through Jupiter, spending under the price, or delivering < 85% (SOL_FLOOR);
  the page refuses to sign one under the floor ("pay with SANTA"), so nobody is charged for a refused payment.
- Tested without money on REAL mainnet (Solana's simulator): tests/solana/sol-pay-sim.mjs and tests/browser/sol-pay-page.mjs
  (the real page path, publicnode blocked): $1 run = $1.00 of SOL, 90.5% arrives; $1 item: 90.5% of 50c burned, 50c SOL to treasury.
- FOUND: publicnode (the page's only Solana server) is blocked on some home networks, incl. Cody's PC, and Solana's own server
  refuses browsers (403): payments, SANTA too, failed there. Now the page falls back to reading through the game server
  (server/relay.js, 5 read-only lookups, signed in).
- STILL TO DO AT LAUNCH (real money, Cody's own wallet, his OK): one ~$1 real SOL purchase, then check its record. Refunds of a
  SOL purchase are owed in SANTA at the quote's amount (shop_refunds is SANTA-only).
- Twitter logo + banner made (marketing/brand/; re-render: tests/browser/promo-brand.mjs). Waiting on Cody: SOL launch test.

### 2026-10-04: 10 TICKS A LEVEL + PASS 100% TREASURY (043 live; servers 5bddf00)
- Levels: 10 top-3 Auto finishes ("ticks") a level, was 5 (levels.js WINS_PER_LEVEL, 043). 9 -> 10 still 10 first places.
  Progress already made was kept (nobody had more than 4).
- The $2 season pass: 100% to the treasury, nothing burned (shoprules burnBpsFor; the page pays in one transfer). The other
  Store items stay 50% burned / 50% treasury; the "burned so far" strip leaves passes out.
- NEXT (Cody asked): pay with SOL at checkout, one tap, no extra steps (SOL swapped to SANTA inside the same payment).
  Needs small REAL mainnet tests: ask Cody before any.

### 2026-10-04: SEASON PRIZES MIXED, PASS $2 = THE COSTUME (040-042 live; servers ad36184)
- Every door: ONE prize for everyone (5 looks, Elf Hat 15, Kevlar Vest 30, 8 "+1 level tick" at 3,7,11,17,21,24,27,29, 15
  ranked tickets). The $2 pass: just the costume, a piece on 2,6,10,14,18,22. Level ticks a season: 8 + streak (was 30+).
- Season tickets are counted apart from bought ones (042 season_tickets()); the Store's "buy at most 10" uses bought only.

### 2026-10-04: SEASON PASS IN POINTS + LOTTERY PICKER, LIVE (039 applied; servers a7cdd2d)
- Points a day (max 700): 5 tasks x100 (Log in + Play 2 every day, 3 rotate incl. new "Win an Auto match"), first 10 Auto
  matches +10 each, top 3 +10 more. 30 doors, one every 300 points; every door shows its free + pass prize (seasonui.js).
  Pass: 6 pieces (2,6,10,14,18,22), 5 level steps (4,8,12,17,21), Elf Hat (15), Kevlar Vest (30), 17 ranked tickets
  (tickets.season_extra: own bank, no cap; ranked spends free > season > bought). Calendar kept: perfect days + streak.
  "Log in" only via the game server (season_login, on reading the season); matches only via season_record (match server).
  Checked live: a real match gave 220 / 210 points exactly as the rules say.
- Lottery: the 1/5/10 buttons are gone: < number > (starts at 1, tap to type, 1 to 10,000).

### 2026-10-04: SANTA HAT SPIN REMOVED (Cody: "delete it; if we want a wheel back we will make a new one")
- Gone: spin.js, spin3d.js, spinui.js, its hidden card, the admin wheel editor, the server/house/settings branches, spin.test and
  spin-test. The server refuses 'spin' as an unknown game; the live database never had a Spin run (checked).
- KEPT ON PURPOSE: the shared Game POOL's key is still 'spin' everywhere (database row, wallets SPIN_POOL_WALLET / spinPool.json,
  admin, alerts). It is the pool, not the wheel. Do not rename it without a migration.
- Moved: the demo Game pool + showResult to mockups/gamepool.js (window.__pool in tests); topOff is one function in slots.js.
- Published settings still carrying spin10/spin100/spin are accepted and ignored; the next published version drops them.
- Live: game server at abbc1ab (restarted with 0 players), site build bbd46c7902. Suite 33/33; money tests green.

### 2026-10-04: TIERED WIN CELEBRATIONS LIVE (site build c93443a296)
- mockups/celebrate.js, one scale for Big Hat / Snowball Drop / Stocking Stuffer by multiple of the stake: 1 win, 2 NICE (3x+),
  3 BIG (10x+), 4 HUGE (25x+), 5 pool jackpot. Only plays that came out ahead celebrate (tierOf; tests/celebrate.test.mjs).
  Pictures: tests/browser/tier-shots.mjs. Stocking never shakes (tap position). spin-test (hidden wheel) fails before and after:
  flagged as its own task.

### 2026-10-04: 4 MARKETING VIDEOS
- marketing/out (local only, gitignored): 1-player-intro, 2-steal-the-hat, 3-seasons, 4-arcade; 9:16 MP4s, 17-22 s, sent to Cody.
- How: real game renders (mockups/promo-stills.html via tests/browser/promo-stills.mjs) animated in Cody's Grok Imagine
  (Chrome, video 6 s 9:16; clips downloaded with his OK into marketing/raw); real match footage (promo-gameplay.mjs) and
  arcade footage (promo-arcade.mjs), both headed Chrome; edited by marketing/compose.html from marketing/timelines/*.json
  (promo-compose.mjs): music synthesized in the page, a standard MP4 via WebCodecs + mp4-muxer. promo-frames.mjs = contact sheet.
- To change a video: edit its timeline JSON and rerun promo-compose.mjs (about 30 s).

### 2026-10-04: 50-PLAYER SIMULATION + EXPERIENCE AUDITS, ALL GREEN
- `tests/db/full-sim.mjs [players] [buyers] [rounds]`: a private copy of the game (all migrations, the real match server,
  levels, Store, games, lottery, seasons; stand-in chain payments). 30 wallet + 20 email accounts play every round; 30 buyers max
  out the Store, buy levels, tickets, the pass and lottery tickets, and play 900 mini-game plays; every book is checked to balance.
  50/30/3 and 200/30/2 both pass. It found two real bugs, both fixed and live (974e10c): Auto match crowding into one room while
  sign-in checks ran, and only 5 public rooms per kind (now 30, refcore PUBLIC_ROOMS).
- Experience audit (`audit-ux.mjs`, 5 screen sizes): 125 findings -> 0 (finger-sized taps, lottery cards one per row on
  phones, hat-red text lightened to `--hat-lit`). phone-shots: Sign in ran off the bar on small sideways phones -> rank chip
  hides there. controls, joystick, full browser suite 33/33, live desktop + phone 33/33 each. Site build 27294b1195.
- Still waiting on Cody for mainnet: fund the wallets, his Phantom address, GO (LAUNCH_CHECKLIST.md).

### 2026-10-04 early: INTERFACE GROUP LIVE
- Results card next step (`online.js endActions`): practice Play again (instant), Auto match "starts by itself" + Leave, ranked
  Play again · 1 ticket, friends' rooms Leave; guest top-3 sign-in nudge (`results-test`).
- First-match tips (`coach.js`): Move / Throw / Get the hat, done by doing, once per browser, Skip; taps pass through (`coach-test`).
- Arcade tab: jump buttons, Good to know fold (`games-tidy-test`). Guide's team line follows TEAM_PAUSED.
- Spooky Halloween plaza LIVE (helper agent, reviewed): 3 skeletons, 2 black cats, 3 zombies, a cobweb (`plaza.js
  halloweenFolk`); outside the ring, never between camera and field; Christmas pixel-identical (`theme-christmas-same.mjs <old
  mockups folder>`), `halloween-spooky-shots`.
- Match call-outs + end highlights LIVE (`callouts.js`, `callouts-test`).
- My wallet under every game's play buttons LIVE (`walletline.js`; game server `wallet` action reads the player's own linked
  wallet via Helius, 10 s memory; `wallet-line-test`, shop-db). Checked on the Droplet against a real devnet account.
- Friends together LIVE: a friends' room host presses "Auto match together" → the match server holds seats for the whole group in a
  public room (20 s) and moves everyone (`referee.js together/holds`). Play page "Games waiting for players" with Join. Tested on
  the LIVE match server: `REF_URL=wss://play.santahatgames.com node friends-test.mjs`.
- Mini-games group LIVE: Winners tabs Latest / Biggest this week (`weekWinners`), pool jackpot banner (`jackpotbar.js`), jackpot
  alerts to Cody's Telegram (`alerts.js`, once each), Share this win picture (`sharecard.js`). Tests: jackpot-week-test,
  share-win-test, games-test, alerts-db. stocking-test can flake on the 390 px phone under parallel load (passes alone).
- WEEKLY MODES: all four built (Hot Hat, King of the Gazebo, Blizzard, Hat Hunt: three hats, S.hats in sim.js) and LIVE BUT ALL
  SWITCHED OFF (Cody: keep them off for now). Admin screen → Weekly modes: a signed switch each (`supabase/034`, `admin.js
  weekly-mode`). Only switched-on modes take turns, one per game week. Rules in `mockups/weekly.js`.
- FIXED LIVE (2026-10-04 00:00 UTC): postgres.js stored JSON sent as text as quoted strings (plays.result etc.): season tasks
  never recorded on the live match server, jackpot alerts/banner could never fire. `worker/pgjson.mjs` on every connection,
  208 rows repaired, a live match then recorded season progress. LESSONS has the rule. Mainnet reset now clears season tables.
- Live checks added: `live-pass-test.mjs` (buys the $5 pass on devnet; passed), `live-match-test.mjs` (season progress
  recorded). Player guide has Friends / Season / Weekly sections.
- FULL BROWSER SUITE run 2026-10-04 (33 tests): green after fixes. Found: published settings were never applied in server mode
  (my load-order slip, fixed and checked live); weekly/burned/wallet answers now robust; two tests had stale waits/stubs.
- ALL THREE SEASONS COMPLETE and live in the database: Halloween (Pumpkin King), Thanksgiving Nov 1-30 (The Gobbler; 035/036),
  Christmas Dec 1-Jan 1 (Gingerbread; 037/038). Each: 5 free looks (doors 2/5/9/14/20) + a 6-piece pass costume (doors 3-18).

### 2026-10-03 late night: HOME PAGE + MONEY STRIPS LIVE
- The site opens on **Home** (intro, Player Progress, the season calendar); Home's Play now → the **Play** page (match types).
  Player Progress is ONE box (`#progress`) that `tabs.js show()` moves to the top of Home or Play. Old `#play` links still work.
- **Money strips** (`mockups/moneystrip.js`) at the top of Games (10% burned / 90% Game pool, the pool and its jackpots, burned so
  far) and Store (50% burned / 50% treasury, lottery 10% / 90%, burned so far). Shares come from the rules files
  (`credits.js GAME_BURN_BPS`, `shoprules.js`, `lottery.js`); burned-so-far from the new public `burned` action
  (`server/games.js`, kept a minute; checked in `tests/db/shop-db`). Tests: `browser/home-test`.
- On the test site the strip's pool and jackpots are the demo pool, the same numbers the games below show (no game server on the
  page until `LAUNCHED`). The burned total is real (devnet: ~84K test SANTA).

### 2026-10-03 night: SEASONS LIVE (Halloween calendar + $5 Pumpkin King pass), big Play button, safe publishing
- **Seasons** (rules in `mockups/seasons.js`, ONE place): Halloween Oct 1–31, Thanksgiving Nov, Christmas Dec 1–Jan 1 (the last
  two have no rewards yet: `free: {}`, `gold: []`, the pass says "opens soon"). 3 tasks a day (game day 9 PM–9 PM Indiana); all 3
  open the day's door. Free track: 5 Halloween looks (doors 2, 5, 9, 14, 20), +1 level step on every other door, +1 every 7 days
  in a row. Gold ($5 pass, Store kind 'pass'): the Pumpkin King, a piece every 3 doors (3…18), backdated.
  Progress ONLY from referee-run public Auto matches (`levels.finishByReferee` → `season_record`). Live: 032 + 033 applied,
  Droplet on the new code (santa-games, santa-referee), site published. Tests: `tests/db/seasons-db`, `browser/season-test`.
- **Pumpkin King costume** merged (helper agent, reviewed); the Pumpkin Costume gear is RETIRED (not sold, does nothing; one test
  account still owns it and its saved slot still counts as "+1 hit" in the database, so they'd remove it to add a Kevlar Vest).
- **Big "Play now"** on the Play page's first screen → free Auto match (`playbtn-test`).
- **Publishing now stamps a build id** on every file (`?v=<build>`) + `buildcheck.js`: no more old/new code mix for the 10
  minutes GitHub caches files (it showed live as the season card with the old item list; worst case the page wouldn't load).
  `DRY_RUN=1 KEEP_DIR=<dir> bash deploy-pages.sh` builds without publishing; `browser/build-stamp-test` checks a build.
- **Next (Cody's list):** first-match coaching tips, Play again on results, sign-in prompt after a guest's top 3, tidier Games
  tab; Snowball Square call-outs/MVP, weekly modes, party join; share-a-win image, biggest wins, pool jackpot banner + Telegram.
  Thanksgiving and Christmas costumes later. Mainnet GO still waits on Cody (fund wallets, his Phantom address, GO).

### 2026-10-03 evening: MAINNET LAUNCH PREP. Cody's target: ~01:00 UTC 10-04. LAUNCH_CHECKLIST.md is the plan.
- **Mainnet wallets made on the Droplet:** `/etc/santa/keys-mainnet`; public addresses in `mainnet.json`. Checked: each loads,
  derives its address and signs.
- **Mainnet settings staged:** `/etc/santa/games.env.mainnet`, `worker.env.mainnet`. Helius is filled in (checked on
  the Droplet 2026-10-03 night: no `__HELIUS_MAINNET_URL__` left). ONE blank remains: `__CODY_PHANTOM_ADDRESS__` (games.env.mainnet).
- **THE SWITCH** is `worker/go-mainnet.mjs`, run as root on the Droplet. Default is check-only; `--go` refuses unless every
  check passes. In order it:
  1. stops the services;
  2. backs up to `/var/backups/santa`;
  3. runs `supabase/ops/mainnet_reset.sql` (rehearsed by `tests/db/mainnet-reset.test.mjs` on a copy of the live data;
     backup in `C:\santa-devnet-keys\backups`);
  4. swaps the settings (`*.env.devnet` kept);
  5. starts everything, opens the wallets' SANTA accounts (`worker/open-accounts.mjs`) and verifies.

  Then:
  1. Cody records his deposit on the admin screen;
  2. set `LAUNCHED = true` in `mockups/gameserver.js` and publish;
  3. Cody's 10¢ dry run.
- **Security review (helper agent + Claude's check), fixed and live:**
  - the old Supabase `games` and `ping` functions are now a 410 stand-in (`supabase/functions/retired`). **NEVER redeploy the
    old games function with test settings: it shares the database with mainnet;**
  - no new runs while a top-off waits for Cody;
  - rent-drain guard: a winner's account is opened at most once a day; a repeat is held;
  - the price is sampled every minute and needs 5 samples;
  - "expired" is re-checked after 2 s before re-sending;
  - no ranked ticket sales while ranked is paused;
  - alerts log their findings even without Telegram.

  Left for after launch: see LAUNCH_CHECKLIST "Known, smaller".
- **Christmas lottery** now draws Dec 23 at 9 PM Indiana (02:00 UTC Dec 24); open draw #3 moved in the database.
- **Tests:**
  - The browser suite runs on Windows Chrome: `PW=… node tests/browser/run-suite.mjs [n at once]`, with `win-chrome.mjs`
    adapting the WSL-era tests. 30 tests, ~15–35 min.
  - All pass except games-test, whose only complaint is a blocked download inside its fake network.
  - spin-test is retired.
  - New live tests: live-shop-test, live-match-test, live-ranked-paused, tests/solana/live-admin-check and payout-memos
    (on-chain exactly-once count).
  - Droplet worker crash test: killed mid-send twice; each payout went out exactly once.

### 2026-10-03: game server on the Droplet, shared pool live, fake-player money test
- **Game server moved to the Droplet.** Fake players now play through https://api.santahatgames.com: `worker/games.mjs`,
  systemd `santa-games` on 127.0.0.1:8082, behind Caddy. Its settings are in /etc/santa/games.env. It uses its own DB login,
  `santa_games` (031, applied). The tester link is `?server=https://api.santahatgames.com`.
  - Why: the Supabase Edge Function froze 75–150 s on fresh starts.
  - The Edge Function `games` is only a FALLBACK now (v33; it doesn't have keptFee).
  - The diagnostic Edge Function `ping` is still deployed; delete it.
  - Update the Droplet: `runuser -u santa -- git -C /opt/santa/repo fetch` + `checkout <commit>`, then
    `systemctl restart santa-games` (santa-worker / santa-referee too if their code changed).
- **Applied live:**
  - 026: one shared Game pool for Drop, Stocking and Big Hat; each game's jackpot is 25% of the pool.
  - 028 (level-reward looks) and 029 (costumes).
  - 030: every reset is at 9 PM Indiana time.
  - The weekly lottery runs itself on Sunday at 9 PM Indiana (from the Droplet timer).
- **Fake players with devnet money on the live site** (`tests/browser/live-money-test.mjs`, real Chrome, 3 players):
  - What they did: wallet sign-in, then Drop 5×10¢, Stocking (tapping the stockings) and Big Hat, all paid with real devnet
    transactions.
  - Bug found: 2 of 3 Big Hat pulls bought in the same second were paid but never played (LESSONS, 2026-10-03).
  - Fixed in 4242f43 (page published, Droplet updated). The 2 stranded pulls were handed back through the page's own recovery
    (`live-resume.mjs`), played as runs 14 and 15, and their winnings paid.
  - After the fix: all 15 runs settled; all 11 payouts sent by the Droplet worker; both pools' books equal their wallets to the unit.
- **Alerts are off** (no Telegram bot yet), so nothing checks books against wallets automatically. Check them by hand
  (pools.santa_raw vs the pool wallet's balance) until Cody sets up the bot.
- **Next:**
  - Prove one real automatic Sunday lottery draw (buy test tickets first).
  - Write the player guide.
  - Money soak test with more players.
  - Security review.
  - Delete `ping`.
  - Before mainnet, give the page its own Solana node address, e.g. a Helius key locked to santahatgames.com.
    - Why: the page checks that a payment is confirmed by asking a FREE public Solana node from the player's browser.
    - What happened: with 5 fake players on one connection, that node answered "too many requests" hundreds of times.
      Nothing was lost; payments were just slower.
- **Waiting on Cody:** reopening ranked (still paused: /etc/santa/ranked-paused), the Telegram bot.

### Costumes (2026-10-02, built by a helper Claude on a worktree branch; 029 applied and published 2026-10-03)
- Cody: "make a special level 5 and a level 10 costume, build 1 for each slot that matches itself ... They will be free."
  **Level 5 Nutcracker Soldier**: Nutcracker Coat (red, gold cords/buttons/collar/epaulettes, white belt, coat tails), Nutcracker
  Trousers (white, red side stripe, tall black boots), Nutcracker face (square painted wooden head, moustache, teeth jaw, white
  gloves), Nutcracker Shako (tall black, gold bands, badge, plume), Toy Drum (on the back, white rope zigzag, drumsticks, sash),
  Nutcracker Gold snowballs. **Level 10 Frost King**: Frost King Robe (ice-blue robe with a flared hem, blue panel, crystal clasps,
  ice-shard collar), Frost King Trousers (silver, ice stripe, ice boots), Frost King face (frosted, crystal marks, icicle beard),
  Ice Crown, Ice Wings, Crystal snowballs. All free (level unlocks), one per look slot, skin excluded; bots never wear them.
- Files: `catalog.js` (items with `set`/`trim`, COSTUMES), `kit.js` (HEADS, hatPieces, packPieces, COSTUME_TRIMS), `tabs.js`
  (Costumes tab: wear the whole costume in one tap + the back pieces, since there's no Backpacks tab; "Level N costume" tags),
  `online.html` (tag CSS), `online.js` (Avatar preview shows a costume hat instead of the Santa hat; test hook hatShown),
  `refcore.js` (bots skip costume pieces), `supabase/029_costumes.sql`.
- To go live: apply 029, publish the page, and update the Droplet's match server checkout (its catalog.js must know the new ids,
  or other players see those slots plain). Tests: `node tests/catalog-sql.mjs`, `(cd tests/db && node costumes-db.test.mjs)`,
  `(cd tests/browser && node costumes-test.mjs)` in WSL (screenshots in tests/browser/out/costumes/).

### Stocking Stuffer (2026-10-02, built by a helper Claude on a worktree branch; NOT published, 025 NOT applied anywhere)
- New Games-tab game (Cody's brief): 20 stockings, 8 gifts, first coal ends the turn; pays 0 · 0.5× · 1.75× · 4× · 8× · 16× ·
  40× · 90× · 250×; **exact payback 60.519%**. Full notes: DESIGN_NOTES → "Stocking Stuffer". Files: `mockups/stocking.js`
  (rules), `stockingboard.js` (the mantel), `stockingui.js` (the card); server kind `stocking` in `server/games.js`;
  `supabase/025_stocking.sql` (widens the quotes/runs kind checks; idempotent); admin pay-table editor; deploy list updated.
- **For Cody before real money:** (1) 60.5% payback vs ~80% everywhere else; (2) $1 turns are refused while the Drop pool is
  $100–$250 (250× = $250): 10¢ only, its own pool, or a bigger pool/top-off. Pool rules untouched.
- To go live: apply 025 (confirm the two constraint names first, query in the file), redeploy the game server at the new
  commit, publish the page. Tests: `node tests/stocking.test.mjs`, `(cd tests/db && node stocking-db.test.mjs)` (and
  `REALPG=1` in WSL), `(cd tests/browser && node stocking-test.mjs)` in WSL.
- Found while checking: `deno check supabase/functions/games/index.ts` FAILS on the starting commit 279fddd too (TS2322 at
  index.ts:90, the Telegram `chatId: env(...) || null`); not caused by this work, not fixed here.

### Afternoon 2026-10-02 (Cody playtesting on his phone): all LIVE unless noted
- **RANKED IS PAUSED** (Cody: no testers in ranked). Switch = the file `/etc/santa/ranked-paused` on the Droplet: delete it to
  reopen (no restart), `touch` it to pause. Searches answer "Ranked is paused right now. Try Unranked."
- Ranked has the same Normal play / Special gear ticks as Auto match (rooms PRN#/PRG#; normal strips specials and gear on the
  server). Answers item A: specials count in Special-gear ranked rooms.
- Ranked tickets: "N / 25" on Player Progress, under the ranked lobby's title, and the top-bar chip (read from the game server
  on the demo site too). 25 = 10 free a day + at most 10 BOUGHT held (022, applied live; the shop refuses before paying) + 5
  GIVEN by Cody (giveaways NOT built; give them their own cap of 5 when they are). Cody's words: "bought tickets maxed at 10 +
  free tickets at 5" — read as 5 given; if he meant daily free 10→5, that's FREE_DAILY in ranked.js + 006's 10s.
- Store: the two weekly lotteries side by side, Christmas full width under them. Special snowball pictures (Store, Avatar and the
  in-match SB buttons, which now show the picture instead of SB1/2/3) are drawn with the game's own tracer code (ballfx.js).
- Cody's price sheet LIVE (023 + catalog.js, game server v19, Droplet e6e2300): Ice/Fire $1, Giant/Split $2, Sky $5, Rain $10;
  Kevlar .50, Pumpkin 1, Santa 2, Toy Sack 2, Backpack .50, Elf Satchel 1, Elf Shoes 2, Elf Hat .50, Gift Box 1, in his order.
  Heated Coat REMOVED (gear.js RETIRED: never worn, never a Present Box pick; its GEAR_KINDS slot kept). "Costs N snowballs".
  The Play page's 3% tax note is gone (Games/Store/Lottery keep theirs).
- Upright phones in a match: smaller info boxes, snowball box and scoreboard; zoom +/− side by side under the sound button.
- Cody's own Phantom GbStAPcXZyUsMhsK9JT59wcA2Yoqa5VyKyGcguZZJbPm got $100 test SANTA + devnet SOL (tests/solana/devnet-gift.mjs);
  he tests with the ?server= link (the plain site is the demo: pulls there never ask the wallet).
- Game server v18 (pinned 1183af2); match server on the Droplet at 1286c1d+ (same referee code).
- **Claim rewards: LIVE (024, game server v20, Droplet 1132900).** Admin screen "Claim rewards → Treasury": every NON-SANTA
  token (GP HTmQz7My6MehV7bjhJ6jde8nDND1yvsz68d24LP7YgUQ, GLDX Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re, any other) in the
  Drop/Slots/Lottery pools → treasury, by the worker (server/rewards.js; reward_sweeps through payouts.js). The database refuses
  SANTA, non-pool sources, sweeps without an open signed claim; no destination column. Proven on the LIVE devnet system
  (tests/solana/rewards-live.devnet.mjs) and end to end (rewards.devnet.mjs). Droplet worker.env got LOTTERY_POOL_WALLET; at
  mainnet set it (and SPIN/SLOTS) to the new wallets. GLDX ("Gold xStock") has issuer controls (transfer hook unset today,
  pausable, permanent delegate): if the issuer turns them on, its sweep fails safely and shows "failed".
- **Pools stay plain wallets for launch (Cody, 2026-10-02).** On-chain pool programs were weighed: mainnet deploy deposit ~1 SOL
  per 200 KB (refundable; tools reserve ~2× → 2–4 SOL), plus an audit ($5k–30k+) before real money. Not built.
- At launch also open SANTA accounts for the lottery wallet and treasury (~0.0016 SOL each) so players never pay that rent.
- **Stocking Stuffer: LIVE (2026-10-02)** (Cody's brief; built by an agent, reviewed and verified by Claude, landed 445d0a9;
  025 applied; game server v21; published). Plays from the Drop pool. Exact payback from the table: 60.519% (brief said 60.6%). Pool-coverage at $1 (250× = $250) needs Cody's call before money.
- Known test-browser limit: controls-test's 768×1024 step crashes the slow WSL browser (before this session's changes too).

### Later 2026-10-02 / early 10-03 (all LIVE: game server v24, Droplet cd71238)
- Stocking Stuffer since: payback raised to 78.146% (2.5/6/10/20×), TAP TO OPEN (asTapped: the k-th tap shows the k-th item of
  the fair sequence; a pick can't change a turn), run counter counts only what the player has SEEN (Drop: on landing).
- Looks: only Snowman $1 / Panda $1.50 / Gorilla $2 sold; skins free; other looks unlock at levels 2,3,4,6,7,8,9; level 5
  NUTCRACKER SOLDIER and level 10 FROST KING costumes (one piece per look slot, free; Avatar Costumes tab; bots never wear them).
  028 + 029 applied; live items table == catalog.js (74 rows).
- EVERY RESET AT 9 PM INDIANA TIME (America/Indiana/Indianapolis, DST-aware; 030 + mockups/gameclock.js): free ranked tickets and
  the 10-bought-a-day limit reset for everyone at 9 PM; Ranks Today = since 9 PM, This week = since Sunday 9 PM. Weekly lottery
  draws Sunday 9 PM Indiana time (lottery.js). Gear's 7-day wear is a lifetime, not a reset (unchanged).
- LOTTERY FULLY AUTOMATIC: a Droplet timer (worker/systemd/santa-alerts.*) runs due draws every 5 min (FOUND: nothing ran draws on a
  schedule before; a draw waited for someone to open the lottery), then alerts; payouts switched to AUTO on devnet (signed with
  the codyAdmin stand-in; tests/solana/lottery-auto.devnet.mjs). At mainnet Cody signs "Switch to automatic" once. Not yet proven
  end to end with a real draw on devnet: buy test tickets before a Sunday draw and check the winners were paid by the worker.
- Alerts call can take ~75 s on the free devnet RPC (walletRaw has no time limit): TODO add AbortSignal.timeout there.
- Sign-in: "Open in Phantom / Solflare" on phones with no wallet (no WalletConnect: Phantom doesn't support it; Cody agreed).
- Focus group: santahatgames.com/feedback.html (027 tester_feedback: anyone adds, nobody reads via the site); tester script page
  https://claude.ai/artifact/MTdnHbmpLarQ8xxWtbGLJD (private until Cody shares it). TEST_PLAN.md has the test research.
- IN PROGRESS (agent, worktree): one shared Game pool ($500 start, top-off below $200, $25 skim at $1,025) for Slots/Drop/Stocking,
  pool jackpots 25% × pool × (bet / $1) in each game (Drop's 100× centre, Stocking's 8 gifts), Stocking 20 stockings / 9 gifts
  (~73%, Cody's choice). Claude reviews, applies 026, merges the devnet slots-pool money + books into the 'spin' pool, deploys.

### Overnight 2026-10-02 (Claude, while Cody slept): what changed, in plain English
- **Cheat-proof match referee is LIVE on the Droplet** (wss://147-182-219-161.sslip.io): every match runs on our server, pages
  only send moves, so nobody can fake scores. Signed-in players play with their SAVED level and items (the database only
  saves items they own); guests play plain. Auto match finishes are recorded by the server.
- **Ranked is built on it:** sign in + 1 ticket, the server picks the room, 2 real players to start, rank points from the
  Play-page rules, once per match; quitting mid-match still costs the −5. Tickets show in the top bar and the ranked lobby.
- **Players only see the referee and ranked when the page uses it** (today only with `&ref=wss://147-182-219-161.sslip.io`
  on unpublished code). Next step for that: make it the default + publish = Cody's call (with item 4 below).
- **Payout worker installed on the Droplet**, waiting for item 3 (or the easier "make the worker its own login" option).
- **Button audit (agent, reviewed):** 210/212 controls, 0 dead ends, all 8 purchases complete in server mode. Fixes landed;
  REPORT in audits/2026-10-02-buttons/. While fixing: a real money bug (a network hiccup after a payment was SENT lost it)
  is fixed in wallet.js.
- **Played the LIVE site like a player** (real Chrome, real GPU, clicks/keys/touch, desktop + phone): 33/33 as a guest.
  In server mode found and fixed: raw "sign in first" + "Demo" wording in the buy dialog. Test: tests/browser/live-player.mjs.
- **Lottery: tickets are final, no refunds** (Cody), shown on every card.
- **Snowball Drop board 2 (Cody, mix B):** 17 presents, 100× centre at 1 in 5,000, 25× 1 in 250, 10× 1 in 83, 5× 1 in 25, 2× 1 in 5.9
  (78.0% exact); presents similar sizes, a little narrower when rarer. Shared pool now starts $300, $25 skim at $1,025, top-off
  below $100, so 10¢ and $1 play the same board. LIVE on the game server (v15); devnet Drop pool filled to $300 the proper way
  (tests/solana/devnet-pool-deposit.mjs: books = wallet). A real devnet payment for 5 drops played on it and its win was sent.
  At mainnet: Cody funds the shared pool with $300 (he said $300–500; one number if he wants more). Not published yet.
- **Live game server** now on Edge Function version 14 (price/tax + network, my tickets). Database: 017 (referee login) and
  018 (ranked results) applied live.
- **Not published:** everything above that changes the page (the public site still runs the previous build). Publishing is
  one script (deploy-pages.sh) once Cody has looked.

### >>> CODY'S LIST: everything left before launch that only Cody can do (updated 2026-10-02; Claude adds, Cody ticks) <<<
Everything else on the launch path is built, tested and live. In the order to do them:

**A. ~~Specials in ranked?~~ Answered (2026-10-02):** players choose Normal play or Special gear (or both) for ranked too.

**B. Telegram alerts (about 3 minutes; built and live, waiting for the bot):**
   1. In Telegram, message **@BotFather**: send `/newbot`, name it `Santa Hat Alerts`, pick a username ending in `bot`.
   2. BotFather replies with a TOKEN. In Supabase → the project → Edge Functions → **Secrets** → Add: name `TELEGRAM_BOT_TOKEN`,
      value = that token. Save. (Secrets are yours to paste; Claude never types tokens.)
   3. In Telegram, open your new bot and press **Start**. Within 5 minutes alerts are on (the server finds your chat itself).
   What you'll get: a payout frozen by the safety cap, a send that failed 5 times, winnings stuck over 10 minutes, a top-off
   waiting for your deposit, an emergency stop, the match server down, books not matching a pool wallet, a strong bot signal.

**C. "Are you human?" at sign-in: SKIPPED for now (Cody 2026-10-02: "I'll add it if I need to").** Built and off; when wanted:
   1. Sign in to Cloudflare (or make a free account) in Chrome → **Turnstile** → Add widget: name `Santa Hat Legends`, hostnames
      `santahatgames.com` and `www.santahatgames.com`, mode **Managed**. Tell Claude when it's made.
   2. Claude reads the widget's SITE key (public) and publishes it in the page. Then, ONLY after Claude says the page is live:
      Supabase → Authentication → **Attack Protection** → Enable CAPTCHA protection → provider **Turnstile** → paste the SECRET key
      → Save. (In that order: the other way round nobody could sign in.)

**D. Play once on the test network (about 10 minutes):** set Phantom to devnet, import a test player (Settings → Add / Connect
   wallet → Import private key → the contents of `C:\santa-devnet-keys\players\testPlayer1.phantom.txt`), open
   https://santahatgames.com/?server=https://api.santahatgames.com , sign in with the wallet and buy
   a Big Hat pull or a Snowball Drop. A win should arrive in that wallet by itself within a minute. Tell Claude how it went.

**E. Real money (each step needs your OK; Claude walks you through):**
   1. Say "switch the site to the server": the public site stops being a demo (one line in the page).
   2. Real wallets: Claude makes new mainnet pool / lottery / treasury wallets ON THE DROPLET (keys never leave it) and gives you
      their addresses. You fund them: Drop pool $300 of SANTA, Slots pool $500 of SANTA, a little SOL (about 0.05) in each for fees.
   3. Your Phantom's public address as the admin wallet (for the admin screen's signed actions).
   4. Your Helius address (it contains your Helius key) pasted into Supabase → Edge Functions → Secrets as `SOLANA_RPC_URL`.
   5. Claude then resets the test books, points everything at mainnet (no test token), and runs the full checks again.
   Recommended before real money: a lawyer's look at the paid games (RESEARCH.md → "Other things that would help").

**F. Your other project "Green Life Game" is using most of the free game-server calls** (found 2026-10-02): the Supabase account
   has 500,000 a month; it was at 155,000 after 4 days (Santa Hat itself: about 200 a day). If the account runs out, Supabase
   pauses BOTH games. Have that game's Claude look at what's calling it so often, or upgrade the Supabase plan.
   (Cody 2026-10-02: he'll upgrade to Pro if needed. E waits for the real-money launch.)

Done from this list (2026-10-02): email sign-in through Resend (from signin@santahatgames.com, Santa Hat design, 8-digit code box;
confirmed delivered), the payout worker live with its own limited login, 5 funded devnet test players, the Christmas late-payment
refund (decided: refunded), the domain santahatgames.com (site + play. match server + email), Auto match choices, 60-second rounds,
the locked joystick.

### Live services (2026-10-02)
- **Game server deployed** (Supabase Edge Function `games`, verify_jwt off: it checks sign-ins itself). Pinned to a commit; to
  redeploy: push the branch, then deploy the one-line `index.ts` with the new commit id (see the deploy in this session's notes:
  `import 'https://raw.githubusercontent.com/BuffaloBill46/test-stuff/<commit>/santa-hat-game/supabase/functions/games/index.ts'`).
  Settings (Secrets, all public addresses, each checked by its SHA-256): SOLANA_RPC_URL (public devnet), SOLANA_CLUSTER=devnet,
  SANTA_MINT, SPIN/SLOTS_POOL_WALLET, LOTTERY_WALLET, TREASURY_WALLET, ADMIN_WALLETS (codyAdmin).
- **Database:** 001–016 applied live (006 ranked tickets + 016 shop on 2026-10-02, hash-checked).
- **Auth:** Solana wallet sign-in ON; Site URL + redirect = the live site (were localhost).
- **Droplet** santa-hat-legends 147.182.219.161 (hardened). Payout worker installed 2026-10-02: code at
  /opt/santa/repo (commit 014725e, owned by user `santa`), systemd service `santa-worker` (enabled; runs only once
  `/etc/santa/worker.env` exists: DATABASE_URL, SOLANA_RPC_URL, SANTA_MINT, TREASURY_WALLET, KEYS_DIR=/etc/santa/keys), keys in
  /etc/santa/keys (empty, chmod 700). Update: `runuser -u santa -- git -C /opt/santa/repo fetch` + checkout the new commit, then
  `systemctl restart santa-worker`. Logs: `journalctl -u santa-worker`. Memory note "santa-droplet".
- **Helius:** Developer plan confirmed (not wired: devnet uses the public RPC).
- **Domain santahatgames.com (Cody bought it at GoDaddy 2026-10-02; Claude set it up in his Chrome):** DNS at GoDaddy:
  @ → GitHub Pages (185.199.108/109/110/111.153), www → buffalobill46.github.io, play → the Droplet 147.182.219.161; the name
  servers and the _dmarc record unchanged. The site: GitHub Pages with the custom domain (CNAME file on gh-pages; deploy-pages.sh
  writes it only while the domain points at GitHub); the old github.io address forwards to it. The match server: Caddy serves
  play.santahatgames.com (sslip.io name kept as a fallback). Supabase Auth: Site URL https://santahatgames.com/, redirects
  santahatgames.com/**, www.santahatgames.com/**, the old github.io/test-stuff/**. Game server and match server accept it.
  Live links: https://santahatgames.com and, for the devnet server, https://santahatgames.com/?server=https://api.santahatgames.com
- **Match referee server LIVE on the Droplet (2026-10-02, phase 1, opt-in):** service `santa-referee` (worker/referee.mjs on
  127.0.0.1:8081) behind Caddy at `wss://147-182-219-161.sslip.io` (free automatic certificate; health:
  https://147-182-219-161.sslip.io/health). Try it: add `&ref=wss://147-182-219-161.sslip.io` to the game's address (needs the
  page published with refcore.js). Two real browsers played a match through it from Cody's PC. Phase 2 (server side) live
  the same day: sign-ins checked, saved level/look used, finishes recorded, through its own limited database login
  `santa_referee` (017; password only in /etc/santa/referee.env on the Droplet, set as a SCRAM hash, never in the repo). TODO.
  RANKED live on it too (018 applied): sign-in + ticket, server-picked room, 2 real players to start, rank points once per
  match. All of it reaches players only once the page uses the referee by default and is published (Cody's call).

*(Update this section at the end of every session.)*

**Last updated:** 2026-10-01, main Claude on Cody's Windows machine, branch `claude/test-stuff-section-egujzy` (the cloud
branch `ccr-55527f21-p10a6h` is merged in; the live site was last published from it, so publish only from this branch).

**Main Claude session 1 (2026-10-01), devnet move. Done and verified:**
- All suites pass on this machine (Node, PGlite, real Postgres 14 + Deno in WSL, LiteSVM in WSL, browser tests in WSL Playwright).
- **Santa Lottery: backend BUILT** (Cody: server-run, five lotteries, no VRF; DESIGN_NOTES → "Santa Lottery"): `mockups/lottery.js`
  (rules), `supabase/011_lottery.sql` (APPLIED live, views read-only), `server/lottery.js` (draws with sealed secrets, checked ticket payments, fair
  re-checkable draws, exact splits, late payments moved/refunded), admin `lottery-mode` / `lottery-paid`, web door + Edge Function
  (`LOTTERY_WALLET`). **Payout mode is one setting** (Cody hasn't decided escrow vs by hand; starts 'manual'). Tests:
  `tests/lottery.test.mjs`, `tests/db/lottery-db.test.mjs`. **Page BUILT and live** (`mockups/lotteryui.js`: five cards, countdowns, buy via the wallet step, recent draws with Check this draw,
  re-run from public data; `tests/browser/lottery-test.mjs`) and the **admin Lottery panel** (private list of winners to pay by
  hand with full wallets, paste the transaction to record, mode switch). Draws run on exactly the public ticket list so anyone can
  re-check them. Until the server is deployed, buying says sales open soon.
- **Levels BUILT end to end** (`mockups/levels.js`, `supabase/010_levels.sql` APPLIED live, `server/levels.js`): Player Progress
  box above Unranked; each player's level travels with their look; starting snowballs 5…12 by level (bots 4), kept through
  handovers; the host reports each finished Auto match once (`finish`), top 3 with accounts counted (level 9 → 10 = 10 firsts).
  **NOT built: buying levels** (needs payments open + the treasury). Trust limit until the referee server exists: finishes come
  from the host's browser (stated in server/levels.js). Tests: `tests/levels.test.mjs`, `tests/db/levels-db.test.mjs`,
  `tests/browser/finish-test.mjs`.
- **Phone controls BUILT and published-ready:** floating joystick (only way to move), tap anywhere else throws, zoom +/− (up to 4×).
- **Removed:** Santa Hat Spin (pool lives on as the Drop pool; server refuses new Spin runs), the gold snowball (Gilded).
- **Renamed:** Santa Hat Legends (brand). Test-version notes on Play/Games/Store. All published.
- **Special snowballs BUILT, NOT published** (DESIGN_NOTES, Cody's handwritten pages): Ice/Split/Giant/Fire/Sky/Rain in the
  referee (`mockups/specials.js`, `sim.js`), SB1–SB3 buttons + Q/E/R in matches (numbered by their real slot), the Avatar
  screen's Special Snowballs tab, the Store shelf; hat immunity 2 s and −1 per hit are in. `supabase/012_special_snowballs.sql` is APPLIED live (2026-10-01, hash-checked), so loadouts save. Tests:
  `tests/specials.test.mjs`, `tests/db/sball-db.test.mjs`, `tests/browser/specials-play.mjs`, `tests/browser/loadout-test.mjs`.
- **Match load screen + 5…1 countdown BUILT, NOT published** (Cody): referee phases `intro` (5 s) and `count` (5 s), nobody
  moves/throws in either; every player's level, games, top-3 %, rank points, special snowballs; gear says "coming soon". Numbers
  need the deployed server (013 is applied live; dashes until the server is deployed). Tests: `tests/match-intro.test.mjs`,
  `tests/browser/match-intro-test.mjs`. Browser tests that start matches skip the 10 s (they set the timer to 0).
- **Arcade tab changes BUILT, NOT published** (Cody, 2026-10-01): any run of 1–100 from a ▼ number ▲ box under each game's
  buttons (`mockups/runpick.js`; rules/server say 1–100; `supabase/014_run_sizes.sql` is applied live); a "This run 7 / 25 · won $3.40" counter between each game and its buttons; bigger Big Hat
  reels; "Top Line JackPot" + one "Jackpot odds (Top Line or Pool) about 1 in 7,665" row; Drop shows only "1 in 14.2 to hit a
  5× or 10×"; **price locked per run** (every play of a run converts at its quote's price; note at the top of the Games
  page); settles wait out the server's speed limit (`mockups/slowdown.js`). Tests: `tests/browser/runpick-test.mjs`,
  `tests/slowdown.test.mjs`, the locked-price block in `tests/db/server.test.mjs`.
- **Player Progress:** "or win 5 matches top 3 or better 2 / 5" under Buy level (`tests/browser/progress-or-test.mjs`). Not published.
- **Guests reach the server's public actions** (lottery cards, draw re-checks, load-screen stats were silently skipped for
  guests): `PUBLIC_ACTIONS` in gameserver.js, `tests/public-actions.test.mjs` keeps it equal to server/http.js.
- **controls-test.mjs takes ~16 minutes** in the WSL test browser (the zoom section waits for the camera); give it no time
  limit (a 590/900 s limit killed it and looked like a crash).
- **2026-10-02 state (all PUBLISHED):** special gear is fully live: Special Gear tab (replaced Backpacks), Store sells only
  Special Snowballs + Special Gear with rules (looks are bought on the Avatar screen), gear works in matches, 015 applied live
  (hash-checked), 7-day clock started by the server on counted finishes. Gear is DRAWN on characters and special snowballs have
  bold tracers (`.claude/agents/santa-visuals.md` = the visuals agent brief). Cody's answers: hat pops off only when stunned;
  Elf Hat + gear still 2 hits; Present Box may pick Elf Hat; no stacking the same stat. Lottery restyled like Cody's other
  game; DAILY lotteries switched off (`off: true` in lottery.js). Demo balance $100. Skip ahead toggles with "Normal speed".
  Admin editor prices specials + gear + looks. Open for Cody: team colours under full-body gear; Santa Costume cap vs the real
  hat at a glance; Halloween snow patch colour.
- **Special gear: RULES BUILT, page NOT built** (agent-built on Cody's OK to use agents, reviewed line by line and merged):
  `mockups/gear.js` (GEAR table with one stat each, gearIn, effectsOf, resolvePresent, heldWith, snapshot mask), gear items in
  `catalog.js` (g1/g2 slots; old backpacks stay as looks, owners also get the gear), referee effects in `sim.js` behind
  `gearOf` (extra hits, Elf Hat half size + 2×, held/refill/speed, Present Box picked once per match, kept through handovers),
  and **hits now check the ball's whole path each frame** (fixes thin/fast targets on slow hosts). **No stacking the same stat**
  (Cody). `supabase/015_special_gear.sql` NOT applied: apply it WITH the page. Still to build: Special Gear tab (replacing
  Backpacks; show NO_STACK_NOTE), the page passing gearOf + bigger counter + Elf Shoes speed, gear drawn on the character, the
  server calling record_gear_worn / take_off_worn_gear, net.js local save of g1/g2, buying gear again after it wears out.
  Open for Cody: should an extra-hit-only hit knock the hat off (now: no); Elf Hat + one extra hit goes down on the 1st hit;
  can Present Box pick Elf Hat; gear names Toy Sack/Gift Box vs Santa Bag/Present Box; stop selling old backpacks; free 7-day
  gear for backpack owners. Tests: `tests/gear.test.mjs`, `tests/db/gear-db.test.mjs`.
- **Plaza themes BUILT** (agent-built, reviewed, merged): `mockups/themes.js` (Christmas + Halloween), `plaza.js` builds
  either and swaps mid-match, a "Plaza theme" picker on the Avatar screen (only you see it; remembered on the device).
  Christmas proven pixel-identical (`tests/browser/theme-christmas-same.mjs`). Cody to look at Halloween's snow patches
  (read lilac-pink at dusk). Test: `tests/browser/theme-test.mjs`.
- **spin-test.mjs is STALE since Spin was removed** (it waits for the Spin wheel's bonus, which is never drawn now). Not deleted.
- **Devnet funder** topped up by Cody: 7.95 devnet SOL (2026-10-01).
- **Old browser tests fixed:** mp.mjs, idle.mjs. `live.mjs` is still stale (see the test list).
- **Devnet:** test SANTA `Jx95so9XYhtSJJoqup7Xb3T9Ptr9ZuUTXSgPcu6uttg` (Token-2022, 6 dec, 3%), Spin/Slots/Lottery pools, treasury,
  test player, Santa's own funding wallet; public addresses in `devnet.json`, keys in `C:\santa-devnet-keys` (never the repo).
  Setup: `tests/solana/devnet-setup.mjs` (safe to re-run).
- **Live database:** `005`, `007` applied (checked identical to the files), `009` closes a hole the advisor found (AUDIT #11);
  `pools` rows = the devnet pool wallets to the unit. **The live project now books devnet SANTA: reset `pools` before mainnet.**
- **Payout worker live chain adapter** `server/solanachain.js`, proven on devnet incl. both crash cases (`tests/solana/chain.devnet.mjs`).
- **Real wallet payments** `mockups/wallet.js` (`window.santaPay`, Wallet Standard; pays only from the account's wallet, on the
  server's network; waits for finalized; a paid-but-unconfirmed run is retried on the next visit). Proven on real devnet in a
  browser: pay → 5 plays → ONE payout sent, books = wallets (`tests/browser/devnet-pay-test.mjs`).
- **Not done yet:** Edge Function deploy + its settings (waits on `npx supabase login` by Cody), a real-Phantom check in Cody's
  Chrome, the scheduled payout worker, skims on chain, reconcile on a schedule, publishing the specials, load screen and Arcade tab pages (012–014 are applied).
- ~~Waiting on Cody: `npx supabase login`~~ NOT NEEDED (2026-10-02): the game server is deployed through the Supabase
  connector instead (a one-line Edge Function that loads the code at a pinned commit of the public repo). Decided: devnet wallets are
  Claude's to make and fund (labelled in `devnet.json`); lottery payouts manual; real wallets at launch.
- **Next, in order:** (012–014 applied live 2026-10-01) browser suite, then publish the pages; deploy the Edge Function + settings once
  Cody has logged in, then a full devnet test through it → special gear → themes.

**Built and live (all demo, no real money):**
- **Play tab:** Snowball Square multiplayer (rooms, bots that now sometimes emote, idle kicks), unranked lobby, FFA RANKED layout
  (Auto match off until tickets + server exist), live games list with Watch now. Sound effects with a remembered mute button.
- **Store / Avatar / Ranks tabs:** item catalog, avatar editor, wallet or email sign-in with linking, leaderboard.
- **Arcade tab:** Big Hat slots, Santa Hat Spin and Snowball Drop, each with **Play 1 / 5 / 10 buttons** (one payment, the plays
  run straight away, winnings sent automatically at the end; no credits, no claim button; Cody 2026-10-01),
  **fair results in Cody's order** (payment first, then the secret) with a "Check this result" panel,
  and the **live SANTA price and live token tax**. Numbers: `PAYTABLE.md` (Spin's numbers there are history: the game was removed 2026-10-04).

**Pre-hand-over pass (2026-09-30, evening):** an audit (`AUDIT.md`: 9 findings, all fixed or handed over, incl. skims that only
happened on paper, price manipulation, and equal payouts silently lost as duplicate transactions), a 100-player focus group
(`FOCUS_GROUP.md`: real game math + 10 real browser walkthroughs; opinions simulated), a **dress rehearsal of the devnet test**
(`tests/solana/rehearsal.mjs`: books = wallets to the unit), the admin screen (`admin.html`). ("My plays" was removed on 2026-09-30 at Cody's call: players don't need it; every play stays in the backend `plays` table.) Cody's open
economy questions from the focus group (payback level, Spin dry runs, top-offs: decided, Cody pays them himself) are in FOCUS_GROUP.md and
FOR_MAIN_CLAUDE.md.

**Third session (2026-09-30, late), from Cody's phone screenshots and requests:**
- **Top-offs: Cody pays them himself** by sending SANTA to the pool wallet; the admin screen shows what to send and records
  the deposit from the chain (`record-deposit`, books exactly what arrived; tested with books = wallet at every step).
- **Phone layout fixed** (Galaxy S22+ upright and sideways): the old scoreboard no longer lingers after Leave; sideways matches
  use a thin top strip; the top bar stays on one line (tablets too); the Avatar camera frames the whole character, hat included.
  Check: `tests/browser/phone-shots.mjs` (6 sizes).
- **"My plays" removed** (Cody: players don't need it; every play stays in the backend log).
- **Spin is now two wheels** (Cody's option A): main 40 equal segments incl. 3 gold stars → bonus wheel 12 (3×/4×/5×),
  every segment readable.
- **Payback set to about 80% on every game** (Cody: "we lose 16% to fees"): Spin 80.0%, Big Hat 6¢ hat bonus ≈ 79.5% with
  the jackpot, Plinko 78.4% (Cody picked its prizes: 10×, 5×, 1×, 0.4×, 0× edges to middle). Pools still never refuse or pause in the simulations; the treasury's skims are smaller. Re-check replays both draws.
- **Snowball Drop (Plinko) preview** at `/plinko.html` (not linked from the game; Cody asked to see it): 8 rows of fair
  50/50 bounces, equal-width presents, prizes 10× · 5× · 1× · 0.4× · 0× (edges to middle), 78.4% payback. Rules `mockups/plinko.js`, tests `tests/plinko.test.mjs`,
  `tests/browser/plinko-test.mjs`. **It shares the Spin pool** (Cody), simulated safe with both games playing. Not wired into
  credits or the server yet.
- **Spin credits are a dollar balance too** (2026-10-01, Cody: per-game credits, either size): buy $10 of Spin, play 10¢
  or $1 spins in any mix. Big Hat still counts pulls.
- **Snowball Drop added to the Arcade tab** (2026-10-01): shares the Spin pool; 10¢ or $1 drops (Cody). Built through to the server and SQL; tests `tests/browser/drop-test.mjs`, `tests/db/server.test.mjs`.
- **"What's SANTA?" draft copy** in `WHATS_SANTA.md` (short + long, from santahat.gold and on-chain facts): Cody to edit.
- **Credits removed; RUNS instead (2026-10-01, Cody):** every game has Play 1 / 5 / 10 at the size picked on the card. One
  confirm, one payment, the plays run one after another (Skip ahead finishes the animations), and when the last one lands the
  run's winnings (plus the price of any play the pool refused) are **sent to the player's wallet automatically, in one
  transfer**: no claim button, the player never signs to get paid. We never hold a player balance. Built through the page,
  server, SQL (`runs` table, `buy_run`, `finish_run`: one payout per run) and the payout worker; every test passes, including
  the on-chain rehearsal. Decision and rules: DESIGN_NOTES → "No credits".
- **A winner is never held (2026-10-01, Cody):** the payout safety cap is now the most a run could POSSIBLY win from its
  prize table (it was a $205 guess a real pull could pass). Only an impossible amount (a fault or break-in) is frozen; it
  shows on the admin screen under **Frozen payouts** (player, short wallet, amount) with a **Release** button you sign with
  your wallet. Proven over 600,036 results (`tests/payoutcap.test.mjs`).

**Fourth session (2026-10-01): locks proven on a real Postgres server, one real-money bug fixed.**
- New `tests/db/lock.test.mjs` starts a throwaway **real Postgres 16** (installed in the cloud workspace; the test skips if it
  isn't) so several connections really run at once, which PGlite can't do. Proven: 80 plays at once on one pool take turns
  (with the lock removed on purpose the check fails); one quote buys one run even with six payments racing; a player's two
  runs settled together are each paid once, exactly; payout workers running at the same moment send each payout exactly once.
- **Bug fixed (High, never live):** two overlapping payout-worker runs could send the same payout twice. Now a worker sends
  only if its compare-and-set save wins (`server/payouts.js`). AUDIT #10.
- **Docs corrected:** "one run at a time" is checked at the quote only (two quotes before paying → two runs). Kept that way
  on purpose (never refuse a paid run) and proven money-safe.

**Fifth session (2026-10-01): speed limit** (Cody: "build it but plan to move it to an always-on game server").
- 60 requests per connection and 40 per player per 10 s, then "slow down, try again in N seconds" (no ban). An honest run of 10
  is ~12 requests; the real page peaked at 3. Built in `server/ratelimit.js`, wired into the web door and the Edge Function,
  counts in the database for now (`007_rate_limits.sql`, applied 2026-10-01), one-line move to the always-on server later.
- Proven on the real Edge Function code under Deno against real Postgres. Open: check the live visitor-address header (TODO).
- Found: the Edge Function's type check had been failing since record-deposit (a type note fixed it); HANDOFF had said it passed.

**Same day, bot signals:** "Check for bots" on the admin screen (private, wallet-signed, read only): clockwork or instant
reactions (strong), no breaks / round the clock (weak). Signals only. The admin screen change is NOT published yet (this
session could only push its work branch): run `deploy-pages.sh` next time.

**Same day, avatar Hats + Backpacks and the Ice Ball** (Cody): new slots with starter items; a worn hat hides under the Santa
hat; snowball items can carry rules and the referee applies them; Ice Ball stuns 50% longer. Cody is writing up the full
snowball types (faster, bigger, longer stun, splits): build those next from his notes. Hats, backpacks and the Ice Ball are Store
purchases for now (Cody; he'll set levels next). `008` applied and the site published 2026-10-01.

**For the other Claude:** `FOR_MAIN_CLAUDE.md` → "Read first" lists every change since the first hand-over that touches the
server, the database or payments.

**Server side, built and proven here but not deployed** (everything else for devnet is in `FOR_MAIN_CLAUDE.md`):
- Edge Function `games` (Cody's choice): quote → buy a run → settle each play → one payout per run, stuck-run tidying, one run at a time per player (at the quote),
  pools in SANTA floating with the price (Cody), escrow admin controls (wallet-signed stop/resume/settings, logged).
- Payout worker: never pays twice, even through crashes (proven on the real token program).
- The Arcade page's server mode (`?server=<address>`), proven end to end against the real server code and SQL.

**Game settings (Cody, 2026-09-30):** the admin screen edits prices, the Spin wheel, Big Hat odds/prizes/symbols, the jackpot
% and odds, and the store (price/level changes, new colour items), with a guard-rail preview. Versioned and wallet-signed;
changes apply to new plays only; every play records its version and price; a run keeps the price it was bought at.
Logic: `mockups/settings.js`. New item SHAPES (not colours) still need code.

**Built but not switched on:** the payment checker and game server steps (`server/`), the runs/plays/payouts database file
(`005`, not applied), ranked matchmaking (`matchmaker.js`). The one-transaction payment split is proven on the real token program.

**Waiting on Cody** (don't build around these; ask if still open):
1. Supabase: turn on Solana sign-in, set URL Configuration (Site URL `https://buffalobill46.github.io/test-stuff/`,
   Redirect `https://buffalobill46.github.io/test-stuff/**`), and connect an email service (Resend) for sign-in emails.
2. Real-device testing with friends (multiplayer over the internet, Phantom sign-in, phone feel, how the sounds feel).
3. The level table (points per level, what unlocks).
4. The treasury wallet's public address, and the real starting amounts for the Spin and Slots pools (real money).
5. ~~Where Cody's on-chain lottery program lives.~~ Answered 2026-10-01: the Santa Lottery is server-run (DESIGN_NOTES → "Santa Lottery").
6. The Slots pool jackpot %: 25% gives about $360–430 on a full pool, and ~14% would give about $250.
7. Whether to build a free daily spin (it costs real money from the Spin pool; with runs it would be a free run of 1 a day).
8. Which new click game to build next (Present Pick, Hat Drop, …) and its odds.
9. The "What's SANTA?" wording (`WHATS_SANTA.md`), and where it goes on the site.
10. ~~Which always-on server~~ **Decided: DigitalOcean** (a new, separate Droplet; ~$6/mo for 1,000 players a day). Cody's other calls (Helius, Turnstile, Telegram alerts, no multisig): FOR_MAIN_CLAUDE → "Cody's calls on servers".
11. A lawyer's check of the paid games before real money (RESEARCH.md → "Other things that would help").

**Next big step:** connect the Arcade page to the Edge Function instead of the in-browser stand-in (`house.js`), apply `005`,
deploy the function. Before real money: Cody's pool wallets (real money), Solana sign-in turned on, a payout worker (sends
queued prizes; needs the pool keys, server-only). The pool lock is proven on real Postgres (2026-10-01).

## Handing over (for Cody)

To move to a fresh Claude Code session: open a new session on the `buffalobill46/test-stuff` repo, and say:

> Check out branch `claude/test-stuff-section-egujzy`, read `santa-hat-game/HANDOFF.md`, and carry on.

(Use whichever branch the last session's "Where we are right now" names as newest; each cloud session may work on its own branch.)

Everything is committed and pushed after each change, so nothing is lost if a session ends suddenly.
Only the chat conversation itself doesn't carry over, which is why decisions go into these files, not just into chat.
