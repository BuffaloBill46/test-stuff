# HANDOFF: start here

If you are a new Claude picking this project up, read this page first, then the files it points to.
It's written so you can take over mid-stream with no other context. **Keep it current:** update the
"Where we are right now" section at the end of every working session, in the same commit as the work.

## The project in one paragraph

**Santa Hat Arcade** is a free browser game for the Solana token $SANTA (brand site santahat.gold). The
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
| `santa-hat-game/AUDIT.md` | The pre-hand-over audit: what was found, what was fixed, what's left. |
| `santa-hat-game/FOR_MAIN_CLAUDE.md` | What this cloud workspace couldn't do (wallets, live deploys, real money). For the devnet move. |

## Where things live

- **Branch:** `claude/test-stuff-section-egujzy` (all work so far). The repo is public: `buffalobill46/test-stuff`.
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
  - Play credits and fair results: `credits.js` (ledger), `fair.js` (secrets, fingerprints, numbers), `house.js` (Cody's order;
    a stand-in for the server), `playcredits.js` (buy counter, readouts, "Check this result").
  - `market.js`: live SANTA price and the token's live tax (read-only), plus the payment split math. `sfx.js`: sound effects.
  - `matchmaker.js`: ranked Auto match logic (not switched on yet).
- **Server code (NOT deployed):** `santa-hat-game/server/`: `verify.js` (is this transaction a valid payment?), `games.js`
  (quote → buy → open → settle, plus tidying stuck plays) and `http.js` (the web door: sign-in, our website only).
  It runs as the Supabase **Edge Function** `supabase/functions/games/index.ts` (Cody's choice; thin wiring, type-checked and
  smoke-run with Deno: `npm install deno` gives a runnable Deno). Pools hold SANTA and float with the price (Cody).
  - `kit.js` / `plaza.js`: the low-poly art kit and the plaza scene.
  - `snowball.js`, `bethehat.js`, `sleigh.js`, `hatchase.js`, `village.js`, `index.html`: the four
    original single-player mockups (published under `/mockups/`). **Not dead code; keep them.**
- **Database:** `santa-hat-game/supabase/001..004_*.sql` are applied to the live project, in order.
  **`005_credits_plays.sql` is NOT applied** (credits, plays, payouts for the server; apply when the server goes live, with Cody's OK).
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
  lottery runs on Cody's own on-chain lottery program (or manually). None of these are hooked up yet.
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
node tests/credits.test.mjs      # play credits + fair results: Cody's order on every play, books balance, refunds on failure
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
node tests/reconcile.test.mjs    # audit: books + everything owed = wallet
(cd tests/browser && node audit-ux.mjs)          # audit: every tab at 5 screen sizes (tap size, contrast, overflow, dialogs)
(cd tests/solana && node pay.test.mjs)          # the page's purchase transaction, on the real token program
(cd tests/solana && node rehearsal.mjs)         # DRESS REHEARSAL of the devnet test: buy, play, pay out, admin, books = wallets
(cd tests/browser && node admin-test.mjs)       # the admin screen: connect, Stop, bad setting refused, save, Resume
cd tests/solana && npm install && node split.test.mjs   # the payment split on the REAL Token-2022 program (LiteSVM, no network)
cd tests/db && npm install && node credits-db.test.mjs && node server.test.mjs  # the SQL + server steps on real Postgres (PGlite)
cd tests/browser && npm install  # once per fresh machine
node lobby-test.mjs              # 3 browser windows: auto match, join from list, Watch now
node tabs-test.mjs               # tabs, store, avatar editor, sign-in sheet
node link-test.mjs               # email + wallet account linking (local stand-in)
node mp.mjs                      # multiplayer room: join, host handover
node idle.mjs                    # 3-minute idle and hidden-tab kicks
node live.mjs                    # loads the PUBLISHED site on a phone-sized screen
node spin-test.mjs               # Games tab: Spin wheel (forced results, tap-to-land, money math, winners list)
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

*(Update this section at the end of every session.)*

**Last updated:** 2026-09-30 (second session of the day). Branch `claude/test-stuff-section-egujzy`; everything committed, pushed and published.

**Built and live (all demo, no real money):**
- **Play tab:** Snowball Square multiplayer (rooms, bots that now sometimes emote, idle kicks), unranked lobby, FFA RANKED layout
  (Auto match off until tickets + server exist), live games list with Watch now. Sound effects with a remembered mute button.
- **Store / Avatar / Ranks tabs:** item catalog, avatar editor, wallet or email sign-in with linking, leaderboard.
- **Games tab:** Big Hat slots and Santa Hat Spin, now paid with **play credits** (buy 1–10 in one go; Cody's decision, replaces
  pay-per-spin), **fair results in Cody's order** (payment and credit first, then the secret) with a "Check this result" panel,
  and the **live SANTA price and live token tax**. Numbers: `PAYTABLE.md`, `mockups/spin.js`.

**Pre-hand-over pass (2026-09-30, evening):** an audit (`AUDIT.md`: 9 findings, all fixed or handed over, incl. skims that only
happened on paper, price manipulation, and equal payouts silently lost as duplicate transactions), a 100-player focus group
(`FOCUS_GROUP.md`: real game math + 10 real browser walkthroughs; opinions simulated), a **dress rehearsal of the devnet test**
(`tests/solana/rehearsal.mjs`: books = wallets to the unit), the admin screen (`admin.html`), and "My plays". Cody's open
economy questions from the focus group (payback level, Spin dry runs, top-off approval) are in FOCUS_GROUP.md and
FOR_MAIN_CLAUDE.md.

**Server side, built and proven here but not deployed** (everything else for devnet is in `FOR_MAIN_CLAUDE.md`):
- Edge Function `games` (Cody's choice): quote → buy → open → settle, stuck-play tidying, one play at a time per player,
  pools in SANTA floating with the price (Cody), escrow admin controls (wallet-signed stop/resume/settings, logged).
- Payout worker: never pays twice, even through crashes (proven on the real token program).
- The Games page's server mode (`?server=<address>`), proven end to end against the real server code and SQL.

**Built but not switched on:** the payment checker and game server steps (`server/`), the credits/plays/payouts database file
(`005`, not applied), ranked matchmaking (`matchmaker.js`). The one-transaction payment split is proven on the real token program.

**Waiting on Cody** (don't build around these; ask if still open):
1. Supabase: turn on Solana sign-in, set URL Configuration (Site URL `https://buffalobill46.github.io/test-stuff/`,
   Redirect `https://buffalobill46.github.io/test-stuff/**`), and connect an email service (Resend) for sign-in emails.
2. Real-device testing with friends (multiplayer over the internet, Phantom sign-in, phone feel, how the sounds feel).
3. The level table (points per level, what unlocks).
4. The treasury wallet's public address, and the real starting amounts for the Spin and Slots pools (real money).
5. Where Cody's on-chain lottery program lives.
6. The Slots pool jackpot %: 25% gives about $360–430 on a full pool, and ~14% would give about $250.
7. Whether to build a free daily spin (it costs real money from the Spin pool; with credits it's just "add 1 credit a day").
8. Which new click game to build next (Present Pick, Hat Drop, …) and its odds.

**Next big step:** connect the Games page to the Edge Function instead of the in-browser stand-in (`house.js`), apply `005`,
deploy the function. Before real money: Cody's pool wallets (real money), Solana sign-in turned on, a payout worker (sends
queued prizes; needs the pool keys, server-only), and the pool lock proven on real Postgres.

## Handing over (for Cody)

To move to a fresh Claude Code session: open a new session on the `buffalobill46/test-stuff` repo, and say:

> Check out branch `claude/test-stuff-section-egujzy`, read `santa-hat-game/HANDOFF.md`, and carry on.

Everything is committed and pushed after each change, so nothing is lost if a session ends suddenly.
Only the chat conversation itself doesn't carry over, which is why decisions go into these files, not just into chat.
