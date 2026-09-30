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
  - `kit.js` / `plaza.js`: the low-poly art kit and the plaza scene.
  - `snowball.js`, `bethehat.js`, `sleigh.js`, `hatchase.js`, `village.js`, `index.html`: the four
    original single-player mockups (published under `/mockups/`). **Not dead code; keep them.**
- **Database:** `santa-hat-game/supabase/001..004_*.sql`, all already applied to the live project, in order.
  New changes go in a new numbered file, applied with the Supabase tools, then committed.

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
cd tests/browser && npm install  # once per fresh machine
node lobby-test.mjs              # 3 browser windows: auto match, join from list, Watch now
node tabs-test.mjs               # tabs, store, avatar editor, sign-in sheet
node link-test.mjs               # email + wallet account linking (local stand-in)
node mp.mjs                      # multiplayer room: join, host handover
node idle.mjs                    # 3-minute idle and hidden-tab kicks
node live.mjs                    # loads the PUBLISHED site on a phone-sized screen
node spin-test.mjs               # Games tab: Spin wheel (forced results, tap-to-land, money math, winners list)
node games-test.mjs              # Games tab: Slots readouts, pulls, forced win and jackpot, money math
node live-games.mjs              # pulls a lever on the PUBLISHED Games tab
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

**Last updated:** 2026-09-30. Branch `claude/test-stuff-section-egujzy`; everything committed, pushed and published.

**Built and live (all demo, no real money):**
- **Play tab:** Snowball Square multiplayer (rooms, bots, idle kicks), unranked lobby (FFA/TEAM, Auto match, private code,
  practice), FFA RANKED lobby layout (Auto match off until tickets + server exist), live games list with Watch now.
- **Store / Avatar / Ranks tabs:** item catalog, avatar editor, wallet or email sign-in with linking, leaderboard.
- **Games tab:**
  - **Big Hat slots:** 5×5, 11 straight/diagonal lines from the first reel, Santa Hat wild, 5¢ per hat, 100× line about
    1 in 11,000, pool jackpot 1 in 25,000 at 25%, "How to win" panel, full screen.
  - **Santa Hat Spin:** 3D prize wheel, 10¢/$1, the agreed odds, own pool, full screen.
  - A shared Recent winners list.
  - Numbers for both games are in `PAYTABLE.md` and `mockups/spin.js`. Pool rules (skim, top-off, emergency stop) are
    adjustable settings: `POOL_RULES` and `SPIN_RULES`.

**Waiting on Cody** (don't build around these; ask if still open):
1. Supabase: turn on Solana sign-in, set URL Configuration (Site URL `https://buffalobill46.github.io/test-stuff/`,
   Redirect `https://buffalobill46.github.io/test-stuff/**`), and connect an email service (Resend) for sign-in emails.
2. Real-device testing with friends (multiplayer over the internet, Phantom sign-in, phone feel).
3. The level table (points per level, what unlocks).
4. The treasury wallet's public address, and the real starting amounts for the Spin and Slots pools (real money).
5. Where Cody's on-chain lottery program lives.
6. The Slots pool jackpot %: 25% gives about $360–430 on a full pool, and ~14% would give about $250.
7. Whether to build a free daily spin (it costs real money from the Spin pool).

**Next big step (needs Cody's OK, costs about $5–10/month):** the game server. It's needed for real SANTA in Slots and Spin
(provably fair results, payments, payouts, escrow admin controls), ranked tickets and payouts, and a shared winners list.
See TODO → "Before anything paid goes live", "Slots server: protect it from bots", and "Escrow admin controls".

## Handing over (for Cody)

To move to a fresh Claude Code session: open a new session on the `buffalobill46/test-stuff` repo, and say:

> Check out branch `claude/test-stuff-section-egujzy`, read `santa-hat-game/HANDOFF.md`, and carry on.

Everything is committed and pushed after each change, so nothing is lost if a session ends suddenly.
Only the chat conversation itself doesn't carry over, which is why decisions go into these files, not just into chat.
