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
  from a $50 start: zero pauses. *(These numbers are for the old fixed 5× top prize. See "Jackpot pools" below.)*
- (Rejected: the pool tops up winners so they receive the full amount.)
- **The tax must be written where players read about the game:** the Play page intro, and the top of every
  game description that pays out SANTA. Done: Play page intro, Wager card, Lottery block. To do: Spin and Slots
  pages when the Games tab is built.

### Pool wallets ("escrows") (decided: 3 to start)
Cody wants only 2–3 to start:
1. **Spin pool.** Takes 90% of spin entries after the tax; pays spin winners.
2. **Slots pool.** Same for slots.
3. **Lottery.** Handled differently from the other two (see below).
Burns need no wallet (they're destroyed straight from the player's wallet). The **treasury** is a separate
wallet that only receives. **Cody is making a new wallet for it** and will send its public address.

**Lottery (Cody's plan):** either run manually by Cody, or use **Cody's own on-chain lottery program**
(a smart contract, so it's trustless: the rules run on Solana and nobody can take the pot). It's already
built and running on devnet (Solana's free test network) in Cody's main Claude Code session, outside this repo.
So **this game doesn't build its own lottery.** It links to or plugs into Cody's. Before real SANTA goes
into it on mainnet, Claude recommends a security review of the program, since it would hold real money.

How the pool wallets are controlled (options; Claude's pick marked):
- **A. A plain wallet whose key lives only on our server (pick, for all three to start).** The server pays winners
  automatically, which instant spins need. Cheapest and quickest. Used for **Spin and Slots.** Risk: if the
  server key leaked, that one pool could be drained. *(The earlier idea of sweeping extra to the treasury is
  dropped: Cody wants the pools to keep everything. See "Jackpot pools" below. The level-off point caps the risk instead.)*
- **B. A shared-approval wallet (multisig, e.g. Squads).** Payouts need Cody's approval too. Too slow for spins,
  but workable for a payout once a day or week.
- **C. A custom on-chain program (smart contract).** Rules enforced by code, most trustworthy, but it needs a
  security review before holding real money. **This is the lottery's route:** Cody's existing lottery program.
Each wallet also needs a little SOL (Solana's own coin) to pay network fees. **Creating and funding them is a
real-money step: not done, waits for Cody.** The keys never go in the website or the repo.

### Jackpot pools (decided: the pools keep everything)
**Cody's call:** the Spin and Slots pools hold all the money that comes in (nothing is swept out), and the
**jackpot pays a percentage of whatever is in the pool.** It can never pay more than the pool holds, so the
jackpot can never empty the pool. That's guaranteed by the math, not just seen in tests.

What the simulation shows (`tests/jackpot-sim.mjs`: 2,000 runs × 20,000 spins, 30% $1 / 70% $0.10 bets, $50 start,
jackpot at the old 5× odds of 0.5%, the fixed 1×–4× wins unchanged):
- **The pool grows, then levels off by itself.** Money in and money out balance at one size. That size depends only
  on the jackpot %, not on how busy the game is:
  | Jackpot | Pool levels off near | Worst 1% of runs after 20k spins |
  |---|---|---|
  | 5% of pool | $624 | $372 |
  | 10% of pool | $312 | $173 |
  | 20% of pool | $156 | $68 |
- **Once it levels off, a $1 jackpot averages about $31 whatever % is picked** (up from a flat $5 today). The %
  only decides how much money sits in the pool, and how fast the jackpot rebuilds after a win.
- **Everything that goes into the pool eventually goes back to players.** Once it levels off, players get back
  about 87.6¢ of every $1 spun. The pool is a players' prize pot, not income. What the game "keeps" is the 10% burn.
- **The level-off point also caps the risk** of keeping the key on our server: the pool never keeps growing.
- Zero paused spins in every run. The pool never went below zero (checked on every spin as an assertion).
- The 3% tax: winners absorb it (decided), including on jackpots.

**Proposals to confirm (Claude's picks):**
1. **The jackpot replaces the 5× result:** same 0.5% odds, the same 2 gold slices on the wheel. 1×–4× stay as fixed wins.
2. **The jackpot scales with the bet:** a $1 spin wins the full %, a $0.10 spin wins a tenth of it. Otherwise
   everyone would bet $0.10 to chase the same prize, and the pool would drain.
3. **10% of the pool:** it levels off around $312, and a $1 jackpot averages about $31.
4. **Show the live jackpot** on the Spin and Slots pages ("Jackpot now: $28.40"), so players can see it grow.
5. **Slots works the same way:** the top line (three Santa hats) pays the jackpot %, and the rest are fixed wins.
   Cody's paytable decides the details.
6. **Safety rule becomes "the pool must cover the biggest *fixed* win (4× the bet)".** The jackpot can't
   overdraw by design.

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
- Average paid back per $1 spin: **$0.745**. *(Before the 3% tax was known this said the pool takes in $0.90 and gains $0.155 per $1. With the tax the pool takes in $0.876 and gains 10.8–13.1¢; see "SANTA's 3% tax" above.)*
- Short-term swings are real: in 2,000 simulated runs of 500 × $1 spins, a pool starting at $0 dipped as low as
  **−$24.50**. The pool needs a starting balance, plus a rule that a spin can only start if the pool can
  cover its biggest possible win (5× the bet).
- **The wheel (decided): 400 slices matching the real odds exactly:** 0x 202, 1x 132, 2x 40, 3x 20, 4x **4**, 5x **2**.
  To keep it readable, neighbouring slices of the same result merge into chunky segments, so the wheel shows
  a couple dozen clear pieces. The 4x and 5x slices stay as thin glowing gold slivers spread around the rim,
  easy to spot even though they're small.

### Proposals
- **Provably fair results.** The server commits to a hidden seed before the spin, mixes in the player's own
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
  The pool typically grew to about $220, and the worst 1% ended around $155. *(Old fixed-5× design; with the
  jackpot the pool levels off instead. See "Jackpot pools".)*
- **Pay per spin:** each spin is its own wallet transaction. No deposited balances; we never hold player funds.
- **Slots numbers:** Cody is drafting the paytable. Claude checks it (payback % and a million-spin simulation) before launch.
- **Daily spend limit per game:** $10 a day at level 1, plus $10 for each level earned (level 2: $20, level 3: $30, …).
  *Assumed to be dollars of entries per game per day, not number of spins. Confirm.*
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
