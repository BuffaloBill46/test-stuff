# Design notes: lobbies, matchmaking, watching

Status: **lobbies and Watch now are built** (unranked works today; ranked Auto match waits for tickets and the server). "Decided" is what Cody asked for. "Open questions" are gaps
Claude filled in as proposals; nothing there is final until Cody picks.

## Decided

### Ranked: Play now opens the "FFA RANKED" lobby
- Title: **FFA RANKED**.
- **Auto match** is the main button.
- **Tournament** sits under Auto match, **greyed out, "Coming soon"**.
- Below that, a **list of games being played right now**, each with a **Watch now** button.

### Auto match (ranked)
Search in this order:
1. Players with **similar rank points**.
2. If that doesn't fill it, **any other real players**.
3. Then **bots** fill the rest.

The rules already agreed still apply: 3–8 players, at least 2 real, 1–3 bots, 1 ticket to enter, 10 points
per player in the pot (bots included), bots can win, and bots play under player-style names.

### Unranked: Play now opens a lobby
- First pick the game type: **FFA** or **TEAM**.
- Then the same lobby layout as ranked (Auto match plus the live games list with Watch now), with **no Tournament**.

### Wager
- Later.

## Open questions (proposals to confirm)

1. **How wide the rank search goes, and how fast.** Proposal: look for players within ±50 rank points
   for 10 seconds, then ±150 for 10 seconds, then any real players. At 30 seconds, start with bots
   if at least 2 real players are ready.
2. **One real player searching alone.** Ranked needs 2 real players. Proposal: keep waiting and show
   "Looking for another player…", with a one-tap switch to unranked while you wait.
3. **When the ticket is spent.** Proposal: when the match starts. Leaving before then costs nothing
   (matches the "refund if you leave before start" rule).
4. **Watching costs messages.** Every viewer receives the live game updates, and Supabase's free plan
   counts each one. Proposal: cap viewers per game (e.g. 4) on the free plan. Raise the cap on our own
   game server later.
5. **What watchers see.** Proposal: the match from above with name tags and the scoreboard, no emotes,
   and a "Watching" badge. Ranked matches show the pot size.
6. **Live games list details.** Proposal: each row shows mode, players (e.g. 6/8), round (2/3), time
   left, and the leader's name and score. Most-watched first.
7. **Where private rooms and practice go in the unranked lobby.** Proposal: Auto match replaces
   today's Quick play. "Private room (code)" and "Practice vs bots" become smaller buttons under it.
8. **Ranked teams.** The lobby title says FFA only. Confirm there's no ranked TEAM mode for now.
9. **Tournament details** (brackets, entry, prizes): later, when it comes off "Coming soon".
10. **Ranked points details (Claude's picks, coded in `mockups/ranked.js`; Cody can overrule):** the pot is created by the
   match, not taken from players (otherwise not placing would cost 10, not the 5 the Play page says); tied players split the
   places they share (whole points, leftovers to the earlier place); rank points never go below 0.

## Economy (decided)

- **All prices are set in US dollars and paid in SANTA** at the current SANTA price.
- **Ranked tickets:** 50% burned, 50% to the treasury.
- **Avatar items:** 50% burned, 50% to the treasury.
- **Lottery:** 90% to winners, 10% burned.

### SANTA's 3% tax (decided; checked on the real token)
- **The token itself takes 3% on every transfer.** Checked on-chain: SANTA (mint
  `3c7mmVSyEH8jfZXgxvpLsETtko1Y16DyRJ5XYB4snhGt`) is a Token-2022 token with a 300 basis point (3%)
  transfer fee. The fee comes out of what *arrives*, not on top of what's sent. The token team's key can
  change the fee, so **the game must read the live fee from the token every time, never assume 3%.**
- **Order of every payment:** 3% tax first, then burn %, then treasury %, then pool %. The percentages
  apply to what's left after the tax. **The last split gets the remainder** (amounts never divide exactly).
- **What the player pays** is the total that leaves their wallet: a $1.00 spin means $1.00 of SANTA out of
  their wallet at the quoted price, with a small cushion for price moves. **Cushion (decided): 2%.** The price
  quote is locked for 60 seconds, and a payment counts if it's within 2% of the quoted SANTA amount.
- **How it works on the chain:** burning isn't a transfer, so the burn part pays no tax. That leaves a little
  extra, which lands on the last split through the remainder rule. Worked examples (from `tests/tax-split.mjs`):
  - **$1.00 spin (10% burn / 90% pool):** 9.70¢ burned, 90.30¢ sent to the pool, 87.59¢ arrives.
  - **$1.00 ticket (50% burn / 50% treasury):** 48.50¢ burned, 51.50¢ sent, 49.95¢ arrives in the treasury.
- **Never route a payment through an in-between wallet.** Each hop costs another 3%. The player's single
  transaction burns directly and sends straight to each final wallet.
- **Moving our own SANTA is taxed too:** seeding a $50 pool takes about $51.55 sent.

#### Winners' payouts: the player eats the 3% (decided)
Paying a winner from a pool is a transfer, so 3% comes off. **Cody's call: the winner absorbs it** ("all SANTA
holders know it"). A 2× win on $1 sends $2.00 and the player receives $1.94. Same for lottery prizes and wagers.
- Players get back 72.3¢ per $1 spun on average; the pool keeps about 13.1¢. Simulated 5,000 × 3,000 $1 spins
  from a $50 start: zero pauses. *(Spin on its own pool, as decided. See "Spin and Slots pools" below.)*
- (Rejected: the pool tops up winners so they receive the full amount.)
- **The tax must be written where players read about the game:** the Play page intro, and the top of every
  game description that pays out SANTA. Done: Play page intro, Wager card, Lottery block. To do: Spin and Slots
  pages when the Games tab is built.

### Pool wallets ("escrows") (decided)
Cody wants only 2–3 to start:
1. **Spin pool** (its own wallet, shared by the two spin sizes). Takes 90% of spin entries after the tax; pays spin winners.
2. **Slots pool** (its own wallet, shared by the two bet sizes). Same for Slots, including the jackpot.
3. **Treasury** (receives ticket and item sales).
3. **Lottery.** Handled differently from the other two (see below).
Burns need no wallet (they're destroyed straight from the player's wallet). The **treasury** is a separate
wallet that only receives. **Cody is making a new wallet for it** and will send its public address.

**Lottery (Cody's plan):** either run manually by Cody, or use **Cody's own on-chain lottery program**
(a smart contract, so it's trustless: the rules run on Solana and nobody can take the pot). It's already
built and running on devnet (Solana's free test network) in Cody's main Claude Code session, outside this repo.
So **this game doesn't build its own lottery.** It links to or plugs into Cody's. Before real SANTA goes
into it on mainnet, Claude recommends a security review of the program, since it would hold real money.

How the pool wallets are controlled (options; Claude's pick marked):
- **A. A plain wallet whose key lives only on our server (pick, for the Spin and Slots pools).** The server pays winners
  automatically, which instant spins need. Cheapest and quickest. Used for the **Spin and Slots pools.** Risk: if
  the server key leaked, that pool could be drained. *(The earlier idea of sweeping extra to the treasury is
  dropped: Cody wants the pools to keep everything. See "Spin and Slots pools" below.)*
- **B. A shared-approval wallet (multisig, e.g. Squads).** Payouts need Cody's approval too. Too slow for spins,
  but workable for a payout once a day or week.
- **C. A custom on-chain program (smart contract).** Rules enforced by code, most trustworthy, but it needs a
  security review before holding real money. **This is the lottery's route:** Cody's existing lottery program.
Each wallet also needs a little SOL (Solana's own coin) to pay network fees. **Creating and funding them is a
real-money step: not done, waits for Cody.** The keys never go in the website or the repo.

### Where the games' server runs, and SANTA price swings (decided, Cody 2026-09-30)
- **Spin and Slots run on Supabase Edge Functions** (free plan). No always-on server for them.
- **Pools hold SANTA and float with the token price.** The pool jackpot (a % of the pool) floats in dollars with it. Fixed prizes
  (e.g. the $100 top line) stay in dollars and are paid in SANTA at the live price. Pool rules (skim, top-off, "must cover the top
  prize") compare the pool's live dollar value (Claude's reading of Cody's call).

### Spin and Slots pools, and the Slots jackpot (decided)
**Cody's calls:**
- **Spin and Slots are two separate games with two separate pools (two wallets).** Nothing is shared between them.
  - **Spin pool:** shared by the $0.10 and $1.00 spins.
  - **Slots pool:** one machine now, the $1.00 Big Hat (the $0.10 Mini Hat was scrapped 2026-09-30).
- **Each pool keeps all the money that comes in;** nothing is swept out.
- **Spin stays simple:** fixed odds 0x–5x (now a main wheel + bonus wheel, see below), no jackpot. "Fun, easy risk."
- **Only Slots has a jackpot,** paying a **percentage of the Slots pool.** It can never pay more than the pool holds,
  so the jackpot can't empty it. That's guaranteed by the math, not just seen in tests.

What the Slots simulation shows (`tests/jackpot-sim.mjs`: 1,000 runs × 20,000 plays, 30% large hat / 70% mini hat,
$50 start). **The slots paytable is a placeholder** (spin's 1×–4× fixed wins plus the jackpot at 0.5%) until Cody's is in:
- **The Slots pool grows, then levels off by itself** once jackpots balance what comes in. That size depends only on the
  jackpot %, not on how busy the game is:
  | Jackpot | Slots pool levels off near | Worst 1% of runs after 20k plays |
  |---|---|---|
  | 5% of pool | $624 | $372 |
  | 10% of pool | $312 | $174 |
  | 20% of pool | $156 | $67 |
- **Once it levels off, a large-hat jackpot averages about $31 whatever % is picked.** The % decides how much money sits
  in the pool (and on the server-held key) and how fast the jackpot rebuilds after a win.
- Everything in the Slots pool eventually goes back to Slots players. The game "keeps" the 10% burn.
- Zero paused plays in every run. The pool never went below zero (checked on every play as an assertion).
- Winners absorb the 3% tax (decided), jackpots included.
- The **Spin pool** has no jackpot, so it would keep growing (about 13¢ per $1 spun). **Cody's rule (decided): when the
  Spin pool reaches $175, $25 goes to the treasury** (arrives as $24.25 after the tax), which puts it back at $150.
  Simulated in `tests/tax-split.mjs`: 2,000 runs × 5,000 spins from $50, zero pauses, and the pool never went below zero.

**Payback target (decided, Cody 2026-09-30): about 80% on every game.** "We need it set at around 80%, remember we lose 16%
to fees" (10% burn + 3% tax in + 3% tax out). The pool receives about 87.6¢ of each $1, so at 80% it still gains about 7.6¢.
Spin 80.0% (main wheel 0× 20 · 1× 12 · 2× 5 · star 3; a real win 1 in 5), Big Hat 78.1% + pool jackpot ≈ 79.5% (hat bonus
6¢), Snowball Drop preview 78.4% (Cody chose its prizes 10× · 5× · 1× · 0.4× · 0×, edges to middle; his first orders paid 154% and 96.5%, over what the pool receives). Pool simulations after the change: no refusals or pauses; the treasury's skim income falls
(Spin about $1,017 → $573 per 20,000 spins; Big Hat about $949 → $483 per 20,000 pulls). Big Hat at 7¢ (82% with the
jackpot) was tried and rejected: the treasury got only about $123 per 20,000 pulls.

**Snowball Drop shares the Spin pool (decided, Cody 2026-09-30).** Same rules as Spin (start, $25 skim at $175, top-off,
emergency stop); a drop only starts if the pool covers its top prize (10×). Simulated 6 million mixed plays (half drops, and
80% drops): 0 refused, 4–5 top-offs (Drop's 10× wins are bigger than Spin's 5×; Spin alone needed none), lowest pool
about $10, treasury about $650–700 per 20,000 plays. Guard rail: Spin's top-off must cover Drop's top prize ($10).
Logic `mockups/plinko.js` (`play`, `canPlay`), test `tests/plinko.test.mjs`.

**Snowball Drop is in the arcade (Cody, 2026-10-01), paid from ONE dollar balance.** "When someone buys $10.00 in tokens
they can play either the 0.10 or 1.00 game." So unlike Spin and Big Hat (credits per game and size), Snowball Drop credits
are a balance: buy $1–$10 in one payment; a 10¢ drop takes 10¢ of it, a $1 drop $1, in any mix. Kept in whole 10¢ units
(never fractions): $10 = 100 units, a 10¢ drop 1 unit, a $1 drop 10. A size the balance can't cover is refused before
anything is taken; a refused or failed drop gives back exactly what it took. Same fairness order; the 8 bounces come from
the fair numbers (one per row), and "Check this result" replays them. Tested: `tests/credits.test.mjs` (to the cent),
`tests/db/server.test.mjs` (real Postgres, the real buy flow), `tests/browser/drop-test.mjs` (the Games tab).

**Slots, current rules (decided by Cody, 2026-09-30; full numbers in `PAYTABLE.md`, always regenerate it after changes):**
- **One machine: the Big Hat, $1.00 a pull, 5×5 grid, 11 paylines: straight or diagonal only, always starting on the first
  reel** (Cody, 2026-09-30; the bent V and zig-zag lines were removed). Short diagonals are 3 or 4 squares long. The Mini Hat is scrapped.
- **Santa Hat is Wild** (stands in for any symbol except Coal). **5 Santa Hats in a row on a line = 100× ($100), about
  1 in 11,000 pulls** (Cody asked for about 1 in 10,000; only the 7 full-length lines can hold 5). **5 Stars = 50×, 5 Snowballs = 25×** (Cody).
- **Hat bonus: every Santa Hat anywhere on the grid pays 6¢** (was 5¢; raised 2026-09-30 for the 80% target below). About 2.6 hats a pull, 15.8% of the payback.
- **Every line prize is more than the $1 pull** (smallest: 3 Snowballs, Bells or Pine Trees = $1.05).
- **Pays back 78.1%, about 80% with the pool jackpot** (simulated 79.5%): line prizes 62.3% + hat bonus 15.8%. **A win over $1 on about 34% of pulls (1 in 3)**; about 96% of pulls
  pay something. Reels: 8 Santa Hats and 25 Coal each (strip of 76). Normal pulls range from $0 to about $205 (several lines at once).
- **Pool jackpot is separate:** its own draw, **1 in 25,000 pulls** (harder than the 100× line), **pays 25% of the Slots pool**,
  and **all 25 squares show Santa Hats**. The reels alone can never make a full grid of hats. Typical size about $360–430.
- **Slots pool skim (Cody): when it reaches $1,775, $25 goes to the treasury** (helps cover the tax on winnings).
  **Demo start: $500.** With the 100× this common, a $250 start locked about 1 run in 100; $500 never locked.
  Simulated: pools settle around $1,750; the treasury gets about $970 per 20,000 pulls.
- Teasers happen naturally at their real odds (e.g. 4 hats then something else: about 1 in 1,000 pulls). Nothing is staged.
- **Top-off (Cody: yes):** below $150 the pool is topped back up to $500, checked before and after every pull.
  **Who pays (Cody, 2026-09-30): Cody, by sending SANTA to the pool wallet himself** ("makes it simple"). The game keeps running on
  the books meanwhile; the admin screen shows "waiting for your deposit" and how much to send (3% tax included); he pastes the
  transaction signature and the server books exactly what arrived on the chain (extra goes into the pool). No wallet key on the server.
- **Escrow admin controls (Cody: required):** adjustable thresholds (all in one settings object, `POOL_RULES`), an
  emergency withdrawal, and an emergency stop that also halts top-offs. Cody-only, wallet-signed, and publicly logged.
- **Open, Cody:**
  (1) Pool jackpot size: 25% of a ~$1,750 pool is about $430, not the ~$250 Cody expected. ~14% would make it about $250.
  (2) Real starting pool amount (the demo uses $500).
  (3) The "$500 threshold bonus" idea: still open.

**Built earlier (demo, 2026-09-29; now out of date, see TODO):** the Games tab has the two machines, stacked: **Mini Hat** ($0.10) and **Big Hat** ($1.00).
The **total Slots pool** shows under the Slots title. Each machine shows its **jackpot % of the pool and the current
jackpot amount**, plus its jackpot odds and biggest fixed win (worked out from the paytable).
- Each cabinet is a Santa hat: red cone body, fur brim base, and the pom-pom on the drooping tip is the lever.
  The Big Hat is taller, with a gold hatband, a star and more marquee bulbs. The reels are 3D symbols: Santa Hat (jackpot),
  Gold Star, Reindeer, Snowman, Present, Lantern, Pine Tree, Sleigh Bell, Snowball, Coal (dud). The Sleigh Bell replaced the
  Pom-pom, which looked too much like the Snowball.
- Each result is picked from the odds table first, then the reels land on it. **No staged near-misses.**
- **Draft paytable in `mockups/slots.js`** (1 in 500 jackpot, top fixed win 20×; about 1 pull in 3.5 wins; fixed wins pay back
  66.9¢ per $1). Draft jackpot %s: Mini 1%, Big 10% (the Mini's is a tenth because its bet is a tenth). Cody sets the real ones.
- **Starting pool vs top prize:** with the draft's 20× top prize, a $50 start paused the Big Hat early in about 3% of
  simulated runs; $100 never did. Recheck with Cody's paytable.

**Proposals to confirm (Claude's picks):**
1. **The jackpot scales with the bet:** a large hat ($1) wins the full %, a mini hat ($0.10) a tenth of it.
   Otherwise everyone would bet mini hat to chase the same prize.
2. **10% of the Slots pool.**
3. **The jackpot is the top line (three Santa hats).** Its odds come from Cody's paytable.
4. **Show the live jackpot** on the Slots page ("Jackpot now: $31.40").
5. **Safety rule (both games):** a play only starts if its pool covers that game's biggest *fixed* win (Spin 5× the bet;
   Slots its top fixed prize). The jackpot can't overdraw by design.

### How to make it work (proposals)
- **One transaction does the whole split.** When a player buys, their wallet signs a single transaction
  that burns their half directly from their own SANTA (a real burn that lowers total supply, not a send
  to a dead address) and sends the other half to the treasury. Nothing sits with us in between, and
  anyone can check it on a Solana explorer.
- **Price quote.** Look up the SANTA price when the player taps Buy (for example from DexScreener or
  Jupiter), lock it for about 60 seconds, and show "$0.50 ≈ 642 SANTA" before they sign.
- **Server confirms before granting.** The server checks the transaction on-chain (Cody already has
  Helius), then adds the item or tickets. A payment that doesn't confirm grants nothing.
- **Lottery.** Superseded: Cody's own on-chain lottery program (or manual draws). See "Pool wallets" above.
  The split stays 90% to winners and 10% burned.
- **Burn tracker.** A small public counter of total SANTA burned by the game, a nice trust signal.

### More ways to spend or burn SANTA (ideas, answering "any other ideas?")
- Name changes after the first free one.
- Emote packs (new speech bubbles).
- Snowball trails and hat-catch effects.
- Clan banners or colors shown in matches.
- A seasonal pass with a cosmetic reward track.
- Extra daily-challenge rerolls.

## Santa Hat Games tab (quick click games)

### Decided
- **Single-player fun games:** each player plays on their own, with no rooms or opponents. They don't use the live multiplayer connection, so they cost no Supabase messages.
- **Every entry on this tab:** 90% into the game pool, 10% burned.
- **Santa Hat Spin:** $0.10 and $1.00 spins, paid in SANTA. Both sizes share one pool.
  - Odds: 0x 50.5% · 1x 33% · 2x 10% · 3x 5% · 4x 1% · 5x 0.5% (adds up to 100%).
  - A random spin wheel. Every outcome has at least 4 slices, spread around the wheel, not clumped in one spot.
- **Santa Hat Slots:** a visually stunning slot machine. $0.10 "mini Santa hat" and $1.00 "large Santa hat"
  bets, one shared pool. The reel needs 10 symbols.

### Checked math (spin)
- Average paid back per $1 spin: **$0.75** (two wheels, 2026-09-30; the old single wheel: $0.745). *(Before the 3% tax was known this said the pool takes in $0.90 and gains $0.155 per $1. With the tax the pool takes in $0.876 and gains 10.8–13.1¢; see "SANTA's 3% tax" above.)*
- Short-term swings are real: in 2,000 simulated runs of 500 × $1 spins, a pool starting at $0 dipped as low as
  **−$24.50**. The pool needs a starting balance, plus a rule that a spin can only start if the pool can
  cover its biggest possible win (5× the bet).
- ~~The wheel: 400 slices, 4x and 5x as thin slivers.~~ **Replaced (Cody, 2026-09-30: "you can't even see half the
  prizes on the wheel bc slivers are to small"; he picked option A):**
- **The wheels (decided): a main wheel and a bonus wheel, every segment the same size, so the segments ARE the odds.**
  Main, 40 segments: 0x **20**, 1x 12, 2x **5**, **gold star 3** (was 21 / 4 at 75%; changed for the 80% target). A star turns the wheel round to its bonus face, 12 segments:
  3x 9, 4x 2, 5x 1. Final odds: 0x 50% · 1x 30% · 2x 12.5% · 3x 5.625% · 4x 1.25% · 5x 0.625%. **Pays back 80.0%**
  (the old wheel 74.5%); a real win (2x+) 1 spin in 5 (was 6.1). One fair number picks the main segment, the next the bonus
  segment; "Check this result" replays both. Options weighed: bonus wheel (picked), Plinko (built as a separate preview,
  `plinko.html`), labels outside the rim, unequal segments that don't match the odds (rejected: misleading).

### Proposals
- **Fair results: the order (decided, Cody 2026-09-30; a safety rule, never change the order).**
  1. The player pays and the payment is **confirmed on-chain**; credits are added. (Tapping Buy decides nothing.)
  2. The player taps play; the server **spends one credit** first.
  3. Only now the server makes a **fresh secret** for this play from a secure random source (not `Math.random`, which can be
     predicted) and locks it in by showing its fingerprint (hash) to the player.
  4. The player's browser adds its own random number. The result comes from secret + player number + play counter.
  5. The result is paid, **then the secret is revealed**, so anyone can re-run it and check the fingerprint matched.
  Why this order: if a secret existed or leaked before payment, a player could see the result and only pay for wins. The locked
  fingerprint before step 4 stops the server from choosing a losing secret.
- **Provably fair results (original proposal).** The server commits to a hidden seed before the spin, mixes in the player's own
  seed, and reveals it afterwards, so anyone can check a result wasn't changed. The wheel then animates to
  a random slice of the winning outcome.
- **Paying per spin.** Either each spin is its own wallet transaction (simple and fully on-chain, but a
  wallet popup every spin), or the player deposits a balance once and spins instantly (smoother, but we
  hold player funds, which is a bigger responsibility). Cody's call.
- **Slots paytable.** Set a target payback like the wheel's, then prove it with a million-spin simulation
  before launch.
- **Slot reel symbols (pick 10):** Santa Hat (top symbol), Pom-pom, Present, Snowball, Lantern, Pine Tree,
  Snowman, Reindeer, Star, Coal (the "Naughty" dud). Alternates: Sleigh Bell, Candy Cane, Mitten,
  Gorilla / Panda heads from the avatar store.
- **More easy click games:**
  - **Hat Drop:** drop a pom-pom through pine-tree pegs into multiplier slots (plinko style).
  - **Present Pick:** choose 1 of 5 presents to reveal a multiplier.
  - **Sleigh Climb:** a multiplier rises as the sleigh climbs; cash out before it crashes.
  - **Advent Scratch Card:** scratch a snowy window to reveal a prize.
  - **Naughty or Nice:** guess higher or lower on the next card.
  - **Free daily spin:** a small free spin once a day to bring people back.

### Decided later (Cody)
- **Starting pools: $100 total. $50 for Spin, $50 for Slots** (separate pools; each game's two bet sizes share its pool).
  Simulation: with $50 and the "must cover 5× the bet" rule, 5,000 busy runs of 3,000 spins never had to pause.
  The pool typically grew to about $220, and the worst 1% ended around $155. *(Spin-style numbers.
  With the jackpot, the Slots pool levels off instead. See "Spin and Slots pools".)*
- **Paying: play credits (Cody, 2026-09-30; replaces "pay per spin").** Players buy 1–10 plays in one wallet transaction and
  get that many credits on their account; each play spends one. We only ever hold small prepaid plays, never deposits of money.
  Rules: credits live only in the database (the server adds and removes them; the page just shows the number); the payment's
  split happens at purchase (Spin credits pay the Spin pool, Slots credits the Slots pool); credits are per game and size
  (10¢ Spin, $1 Spin, $1 Big Hat); no cash-out, no expiry, no bulk discount. A free daily spin would just add 1 credit.
  Details and the tests that must pass: TODO → "Play credits".
- **Slots numbers:** Cody is drafting the paytable. Claude checks it (payback % and a million-spin simulation) before launch.
- **No daily play limit (Cody, 2026-09-30; replaces the earlier $10/day + $10 per level idea).** The math holds up under
  heavy play: one simulated grinder doing 100,000 pulls lost about 25% every time (never ahead in 100 tries), burned
  about $9,700 of SANTA, and the pool never needed a top-off.
- **More click games** from the idea list above are saved for later.

## Technical notes for when this gets built

- The live games list needs a server-side list of running rooms (a lobby channel or a database table
  the referee updates). A browser can't see other rooms without it.
- Matchmaking by rank points should run on the server (with the cheat-proof referee), so players
  can't pick their own opponents or fake their points.
- Spectators join a room as watchers: they receive snapshots but send nothing, and never count as players.

## How it was built (unranked, today)
- Auto match joins one of 5 public FFA rooms or 5 public TEAM rooms: the first with a free seat.
- A public room starts by itself: 15 seconds after 2+ real players are in, or 25 seconds with just 1 (bots fill in).
- Each room's host publishes a one-line summary every 3 seconds to a shared "games board" channel; the lobby lists these.
- Watchers are capped at 4 per game, have no emotes, can't become host, and aren't kicked for being idle.
- Temporary until the server exists: the host browser publishes the summary, so the list is only as honest as the host.
