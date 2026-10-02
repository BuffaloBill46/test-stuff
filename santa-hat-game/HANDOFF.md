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
  - Games tab: `games.js` (Slots page), `spinui.js` (Spin page), `slots.js` / `spin.js` (rules), `slots3d.js` / `spin3d.js` (3D).
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
(cd tests/browser && node server-mode-test.mjs)  # the Games page playing through the real server code + real SQL
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
node tests/levels.test.mjs       # levels: Cody's table exactly; 5 top-3 finishes per level, 9→10 = 10 first-place wins; buy to 5 ($8)
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
node live.mjs                    # STALE (found 2026-10-01): written before the lobby redesign; it stops at "Waiting for the referee" (it blocks Supabase). Until it's updated, click through the live site in a real browser instead
node spin-test.mjs               # RETIRED with Spin (Cody, 2026-10-01): the Spin card is hidden, so this no longer runs; kept with Spin's code
node devnet-pay-test.mjs         # REAL devnet: the page's wallet step buys a Snowball Drop run, server checks the real payment, payout sent (needs tests/solana/devnet-setup.mjs)
node games-test.mjs              # Games tab: Slots readouts, pulls, forced win and jackpot, money math
node sfx-test.mjs                # sound: waits for a tap, fires at the right moments, mute remembered
node live-games.mjs              # buys + pulls + spins + re-checks a result on the PUBLISHED Games tab
```

The browser tests need Playwright installed globally and use headless Chromium with software graphics
(about 8 fps, slow motion; fine for logic, not for judging feel). They run the game with `?net=local`, so
several windows on one computer share a room. Screenshots land in `tests/browser/out/` (not committed).
`shot.mjs` + `steps-*.mjs` screenshot the old mockups; `faces.mjs` renders every face with the hat on;
`logo.mjs` re-renders `hat-logo.png`; `humanscore.mjs` checks scoring.

**Blind spot:** Claude's cloud workspace can't open live WebSocket connections, so real Supabase multiplayer
between two devices has never been tested from here. Cody and friends testing on real phones is the check.

## Where we are right now

### >>> CODY'S LIST: things only Cody can do (newest first; Claude adds, Cody ticks) <<<
**Quick questions (just answer in chat):**
- **Lottery, the one refund left:** tickets are final (done, shown on every card). A payment that only confirms AFTER the
  Christmas draw already ran never becomes a ticket (no draw left); today that money goes back. Keep that? (Claude: yes.)
- **Special snowballs in RANKED:** count them, or plain snowballs only in ranked so it can't be pay-to-win? One switch
  (`rankedSpecials` in worker/referee.mjs); it's ON (they count) until you say.

1. **Email sign-in for real players:** make a free Resend account (resend.com) and, when you buy the game domain (santahat.gold in the
   notes), add the few DNS records Resend gives you at your domain company (GoDaddy is fine). Then Claude connects it to Supabase
   (Auth → Emails → SMTP). Until then: wallet sign-in works; email sign-in only reaches your own Supabase team address.
2. **Try a real wallet on devnet (Phantom):** set Phantom to devnet, then open
   https://buffalobill46.github.io/test-stuff/?server=https://olganobdypnxfpmsxibe.supabase.co/functions/v1/games
   and sign in with the wallet. Send Claude your Phantom devnet address and Claude will send it test SANTA + devnet SOL, so you can
   buy a run, a lottery ticket, a special snowball, gear, a level and ranked tickets for real (devnet). (Claude can't create
   accounts on the live project or sign in for you.)
3. **Payouts on the live devnet server (one copy-paste from you):** the payout worker (the program that actually sends players
   their winnings) is INSTALLED on the Droplet and switched on, but asleep until it can reach the database. It was proven on real
   devnet (sent a payout once, never twice). What Claude needs: in Supabase → the project → **Connect** (top bar) → pick
   **Session pooler** → copy the address that starts `postgresql://postgres.olganobdypnxfpmsxibe:` and put your database
   password where it says `[YOUR-PASSWORD]` (forgot it? Database → Settings → Reset password). Paste that line to Claude in chat.
   Claude then writes it into the Droplet's private settings file, copies the four devnet wallet key files there (locked so only
   the worker can read them), and the worker wakes up within seconds. Until then runs/lottery/shop purchases work, but winnings
   are queued, not sent. (At mainnet the real wallets' keys go on the Droplet the same way, with your OK.)
   **Easier option (new):** reply "yes, make the worker its own login" and Claude makes the payout worker a limited database
   login of its own, like the match referee got tonight (it can only touch the payout tables), so you never paste anything.
   Your OK is still needed because it switches on sending devnet winnings automatically.
4. **When the public site switches from demo to the real (devnet) server:** your call after #2. One line in the page.
5. **Mainnet (real money, needs your OK each time):** paste your Helius RPC address into Supabase secrets as SOLANA_RPC_URL (it holds
   your Helius key), real pool/treasury/lottery wallets, reset the devnet books.

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
- **Match referee server LIVE on the Droplet (2026-10-02, phase 1, opt-in):** service `santa-referee` (worker/referee.mjs on
  127.0.0.1:8081) behind Caddy at `wss://147-182-219-161.sslip.io` (free automatic certificate; health:
  https://147-182-219-161.sslip.io/health). Try it: add `&ref=wss://147-182-219-161.sslip.io` to the game's address (needs the
  page published with refcore.js). Two real browsers played a match through it from Cody's PC. Phase 2 (server side) live
  the same day: sign-ins checked, saved level/look used, finishes recorded, through its own limited database login
  `santa_referee` (017; password only in /etc/santa/referee.env on the Droplet, set as a SCRAM hash, never in the repo). TODO.

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
- **Games tab changes BUILT, NOT published** (Cody, 2026-10-01): any run of 1–100 from a ▼ number ▲ box under each game's
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
  Chrome, the scheduled payout worker, skims on chain, reconcile on a schedule, publishing the specials, load screen and Games tab pages (012–014 are applied).
- ~~Waiting on Cody: `npx supabase login`~~ NOT NEEDED (2026-10-02): the game server is deployed through the Supabase
  connector instead (a one-line Edge Function that loads the code at a pinned commit of the public repo). Decided: devnet wallets are
  Claude's to make and fund (labelled in `devnet.json`); lottery payouts manual; real wallets at launch.
- **Next, in order:** (012–014 applied live 2026-10-01) browser suite, then publish the pages; deploy the Edge Function + settings once
  Cody has logged in, then a full devnet test through it → special gear → themes.

**Built and live (all demo, no real money):**
- **Play tab:** Snowball Square multiplayer (rooms, bots that now sometimes emote, idle kicks), unranked lobby, FFA RANKED layout
  (Auto match off until tickets + server exist), live games list with Watch now. Sound effects with a remembered mute button.
- **Store / Avatar / Ranks tabs:** item catalog, avatar editor, wallet or email sign-in with linking, leaderboard.
- **Games tab:** Big Hat slots, Santa Hat Spin and Snowball Drop, each with **Play 1 / 5 / 10 buttons** (one payment, the plays
  run straight away, winnings sent automatically at the end; no credits, no claim button; Cody 2026-10-01),
  **fair results in Cody's order** (payment first, then the secret) with a "Check this result" panel,
  and the **live SANTA price and live token tax**. Numbers: `PAYTABLE.md`, `mockups/spin.js`.

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
- **Snowball Drop added to the Games tab** (2026-10-01): shares the Spin pool; 10¢ or $1 drops (Cody). Built through to the server and SQL; tests `tests/browser/drop-test.mjs`, `tests/db/server.test.mjs`.
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
- The Games page's server mode (`?server=<address>`), proven end to end against the real server code and SQL.

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

**Next big step:** connect the Games page to the Edge Function instead of the in-browser stand-in (`house.js`), apply `005`,
deploy the function. Before real money: Cody's pool wallets (real money), Solana sign-in turned on, a payout worker (sends
queued prizes; needs the pool keys, server-only). The pool lock is proven on real Postgres (2026-10-01).

## Handing over (for Cody)

To move to a fresh Claude Code session: open a new session on the `buffalobill46/test-stuff` repo, and say:

> Check out branch `claude/test-stuff-section-egujzy`, read `santa-hat-game/HANDOFF.md`, and carry on.

(Use whichever branch the last session's "Where we are right now" names as newest; each cloud session may work on its own branch.)

Everything is committed and pushed after each change, so nothing is lost if a session ends suddenly.
Only the chat conversation itself doesn't carry over, which is why decisions go into these files, not just into chat.
