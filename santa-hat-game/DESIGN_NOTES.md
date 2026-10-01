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

**Lottery: (superseded 2026-10-01, see "Santa Lottery" below).** The earlier plan was to plug into Cody's own on-chain
lottery program. That program is GREEN LIFE's `green-lottery` (devnet `8MHcM3iT1UCWw6e5hihNKYzFzhBRrv75ATPoWPCrR5GA`), and
it can't hold SANTA as written: it books each ticket at the amount SENT, but SANTA's 3% tax comes out of what ARRIVES, so
its vault would always hold 3% less than its books promise (the winner's claim or the last refunds would fail). It's also
5% treasury / no burn, one winner. Cody chose a server-run lottery instead.

### Santa Hat Spin removed; the name is Santa Hat Legends (decided, Cody 2026-10-01)
- **Spin is removed** ("Its not very fun"). Cody's pick: **its pool stays as the Drop pool** (same wallet, same money; shown
  as "Drop pool"; inside the database and server it's still called `spin`, to avoid a migration). Spin's card is hidden on the
  page and its wheel is never drawn; the server refuses new Spin purchases (`RETIRED` in `server/games.js`); a Spin run bought
  before the change still finishes and pays. **Spin's code stays in the repo** (Cody's pick), unused by players, so old Spin
  plays still re-check and Spin could come back. The pool's rules (start, $25 skim at $175, top-off covering Drop's $10 top
  prize) are unchanged.
- **The site/brand is now "Santa Hat Legends"** (Cody's pick: the brand only). The multiplayer mode keeps its name, Snowball
  Square, and the Games tab stays "Santa Hat Games".

### Santa Lottery (decided, Cody 2026-10-01)
**Cody's calls:**
- **Server-run, like Spin:** one lottery pool wallet whose key lives only on the server; provably fair draws; winners paid
  automatically by the payout worker (no claim button); books = wallet checked like every other pool.
- **Five lotteries:**
  | Lottery | Ticket | Draws | Winners |
  |---|---|---|---|
  | Daily 10¢ | $0.10 | every day | 1 winner takes the 90% |
  | Daily $1 | $1.00 | every day | 1 winner takes the 90% |
  | Weekly 10¢ | $0.10 | every week | top 3: 60% / 25% / 15% of the 90% |
  | Weekly $1 | $1.00 | every week | top 3: 60% / 25% / 15% of the 90% |
  | Christmas | $1.00 | once, sales close December 23, 2026 | top 3: 60% / 25% / 15% of the 90% |
- **No cap** on tickets per wallet per draw. Paid in SANTA at the live price (prices in dollars, like everything else).
- **90% to winners, 10% burned** (already decided, Economy above).

**Claude's picks (Cody can overrule):**
- **The burn happens at purchase**, in the player's one transaction (10% burned, the rest straight to the lottery wallet), the
  same as every game: never an in-between wallet, never a second 3% tax. So "90% to winners" means the whole pot (what
  ARRIVED in the lottery wallet, after the tax) goes to the winners; winners absorb the 3% on the way out (decided rule).
- **One lottery wallet for all five pots,** each draw with its own books. Fewer keys and less SOL for fees; the
  reconciliation checks that every draw's pot adds up to the wallet.
- **Draw times: 00:00 UTC** (7 PM US Eastern in winter, 8 PM in summer). Daily: every day. Weekly: Sunday 00:00 UTC (Saturday
  evening in the US). Christmas: sales close and it draws at 00:00 UTC on December 24, 2026 (= 7 PM Eastern on the 23rd).
- **A wallet wins at most one place per draw;** each ticket is one equal chance. If a draw has fewer wallets than places, the
  unfilled places' shares go to 1st (nothing is left over or stuck). A draw with no tickets pays nothing and holds nothing.
- **Fair draw:** when a draw opens, the server makes its secret and publishes the fingerprint (hash) before any ticket is sold.
  At the draw, the result mixes that secret with a Solana blockhash from AFTER sales close (nobody, including us, knows it in
  advance) and the full ticket list. Anyone can re-check: the secret matches the fingerprint, the blockhash is public, the
  ticket list is public.
- **Sales close 5 minutes before the draw** (no new quotes). A payment that confirms after its draw has already been drawn
  moves its tickets to the next draw of the same lottery; for the Christmas draw (no next one) it's refunded in full.

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

**No credits: buy a RUN of 1, 5 or 10 plays that plays straight away; winnings are sent automatically (Cody, 2026-10-01;
replaces every credit design below).** "Remove the credit system. Leave the 3 options to buy 1, 5, 10 on each game. Whatever
they buy auto plays ... This way we don't really hold player funds." Then: "I'm ok with us sending the winnings to the player
without the player signing it, it makes it better and safer for the player", and "just after their 1, 5 or 10 roll it auto
sends" (no claim button). How it works:
- Each game card has three buttons (Pull/Spin/Drop 1, 5, 10) at the size picked on the card (Spin and Drop: 10¢ or $1;
  Big Hat: $1). One confirm, one payment; the plays start the moment the payment is confirmed. Skip ahead finishes the
  animations (results are already decided; Skip only stops showing them slowly).
- The server makes the run's plays (and locks each secret) only after the payment is confirmed. The plays settle one after
  another; the run's LAST play queues ONE payout of everything the run won, plus the price of any play the pool refused
  (emergency stop or refilling). Nothing waits on the player, so nothing is left behind if they close the tab: the server
  finishes a stuck run itself (`tidy`).
- Refused up front (before any payment): the pool can't take the play, the player already has an unfinished run, or the
  account has no linked wallet to send to.
- Invariant (tested as assertions in the demo ledger, on real Postgres and on the real token program): every run is paid
  exactly once, exactly what its plays won + refunded, never before its last play; a payout above the most the run could possibly win is frozen (see below).
- **A winner is never held (Cody, 2026-10-01: "I don't want a hold on a player that wins. It's not cool to hold someone's
  money just because it was a big win.")** The payout safety cap is the most the run could POSSIBLY win from its own prize
  table, so luck can never trip it; only an amount the game can't produce (a bug or a break-in) is frozen. Cody sees frozen
  payouts on the admin screen (player and amount) and can Release one with a wallet signature, "just in case". Options
  weighed: no cap at all (a bug could empty a pool in one payout), a fixed dollar cap (the old $205: a real big pull could
  pass it, rejected), the proven per-run maximum (picked).
- Why not credits: a credit balance is player money we hold; a run holds nothing once it's done. Options weighed: per-game
  credits (built, then dropped), one shared balance (needs one shared wallet or a second 3% tax), claim button (built, then
  dropped for auto-send: one fewer step and the player never signs to get paid).

**(Superseded by runs, above.) Credits were per game; Spin and Snowball Drop were dollar balances (Cody, 2026-10-01).** "Let's just do credits per game:
they buy 10 on spin, the spin credit counter shows 10 and other games show 0." Spin now works like Snowball Drop below
(buy $1–$10 of Spin balance; 10¢ or $1 spins in any mix); Big Hat (one size) still counts pulls. Each game's money still
goes to its own pool at purchase (Spin and Snowball Drop: the Spin pool; Big Hat: the Slots pool). Cody first asked about
ONE balance for all games; that would have needed one shared game wallet (or a second 3% tax on every play), so he chose
per-game credits. Guard rail: Spin's sizes in the admin settings must be whole 10¢ (the balance is kept in 10¢ units).

**Snowball Drop is in the arcade (Cody, 2026-10-01).** (The balance below was superseded by runs, above.) "When someone buys $10.00 in tokens
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
  pay something. Reels: 8 Santa Hats and 25 Coal each (strip of 76). Normal pulls seen in simulation range from $0 to about $205 (several lines at once; the most one pull could ever pay is $1,101.50).
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
  1. The player pays and the payment is **confirmed on-chain**; the run's plays are made. (Tapping Buy decides nothing.)
  2. (Runs, 2026-10-01: the plays start straight away, one after another; each is already paid for.)
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
- **(Superseded 2026-10-01 by runs; see "No credits" above.) Paying: play credits (Cody, 2026-09-30; replaces "pay per spin").** Players buy 1–10 plays in one wallet transaction and
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

## Avatar Hats and Backpacks, and special snowballs (2026-10-01, Cody)
- **Hats** and **Backpacks** are avatar slots (catalog.js), each starting at "None" so old saved avatars still work. Starter
  items (Claude's picks, change freely), all Store purchases for now: Knit Beanie, Earmuffs, Snowman Top Hat, Elf Satchel, Gift Box
  ($0.25); Reindeer Antlers, Toy Sack ($0.50). **A worn hat hides while that player wears the Santa hat** (the prize must
  always be seen; Claude's call). New colours of these shapes can be added from the admin store editor; new shapes need code.
- **Special snowballs** (Cody: faster, bigger, longer stun, splits; full details coming). A snowball item can carry `rules`;
  the match referee applies them. Built so far: **Ice Ball**, `rules: { stun: 1.5 }` (stuns 50% longer: 0.9 s → 1.35 s).
  Any rule is capped at 3× so a bad setting can't freeze a player for long.
- **Decided (Cody, 2026-10-01): the new hats, backpacks and the Ice Ball are bought in the Store for now** ($0.25–$0.50,
  Claude's placeholder prices); Cody will set levels next.
- **Open for Cody:** whether special snowballs count in RANKED
  (a paid gameplay edge in ranked would be pay-to-win; RESEARCH.md's rule so far: cosmetics only, never pay-to-win).

## Speed limit (built 2026-10-01; Cody: "build it but plan to move it to an always-on game server")
**Why:** not about winning (the games can't be beaten by playing fast). A script flooding the server could use up the Edge
Functions' free 500,000 calls a month in about a day (5 requests a second ≈ 430,000 a day) and slow the game for everyone.
**Rules (Claude's starting numbers, generous on purpose; Cody can change them in `RATE_RULES`, `server/ratelimit.js`):**
- **60 requests per internet connection** per 10 seconds (every request, incl. the public winners / pools / settings answers;
  also catches many accounts on one computer; room for shared Wi-Fi).
- **40 requests per signed-in player** per 10 seconds. An honest run of 10 is about 12 requests over several seconds.
- Over the limit: **"slow down: try again in N seconds"** (HTTP 429). No ban; the next window starts fresh. Checked before any
  database work. Counted in fixed 10-second windows, so a script timed exactly on a window edge can get up to about twice the
  limit for a moment; still a hard cap.
- If counting itself fails, requests are let through and logged (a counting fault must never lock everyone out).
- Never cuts off a paid run in practice; if a settle were ever slowed, the server finishes that play itself (`tidy`).
**Options weighed:** per player in the database (built), plus per connection (built), Supabase's own protections only
(unverified, not relied on), nothing beyond the 30-quotes-an-hour cap (leaves the public answers open).
**Where the counts live, and the move (Cody's plan):** today in the database (table `rate_hits`, `007_rate_limits.sql`),
because an Edge Function call may run in a fresh copy that remembers nothing. On the always-on game server (~$5–10/month,
ask Cody before spending) the counts move into the server's memory: one line in the wiring (`memoryStore()`), same rules,
same tests (`tests/db/ratelimit.test.mjs` runs the rules on both). Internet addresses in the table are deleted after an hour.

## Bot signals (built 2026-10-01)
TODO's rule: flag players who play like a script, **review before acting; a real grinder is fine**. So: signals only, on the
admin screen ("Check for bots"), wallet-signed, private (a guess is never shown publicly), read only (not logged, changes
nothing). Options weighed: a public list (rejected: labels players on a guess), automatic slow-down or ban (rejected: the
rule above), a scheduled job that alerts Cody (later, on the always-on server), on-demand admin check (built).
**What it measures:** reaction time, from a run ending (its last play settled) to that player asking for the next price. Both
moments are on our server, so the chain's confirmation time (which varies for bots too) doesn't blur it. A first version timed
the gaps between purchases; rejected before shipping, because the chain's few seconds of variation would hide a timer.
- **clockwork** (strong): 30+ reactions with a spread under 15% (people simulated: 39% at the very lowest).
- **instant** (strong): typical reaction under 1 second.
- **no breaks** (weak): 4+ hours without a 10-minute pause. **round the clock** (weak): active in 20+ of 24 hours.
Numbers in `BOT_RULES` (`server/bots.js`), Claude's first guess; re-tune once there's real play. **Limit:** a script that
adds random waits won't look like clockwork; the speed limit and the game's math (it can't be beaten) still apply to it.

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
