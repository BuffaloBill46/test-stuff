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
  their wallet at the quoted price, with a small cushion for price moves.
- **How it works on the chain:** burning isn't a transfer, so the burn part pays no tax. That leaves a little
  extra, which lands on the last split through the remainder rule. Worked examples (from `tests/tax-split.mjs`):
  - **$1.00 spin (10% burn / 90% pool):** 9.70¢ burned, 90.30¢ sent to the pool, 87.59¢ arrives.
  - **$1.00 ticket (50% burn / 50% treasury):** 48.50¢ burned, 51.50¢ sent, 49.95¢ arrives in the treasury.
- **Never route a payment through an in-between wallet.** Each hop costs another 3%. The player's single
  transaction burns directly and sends straight to each final wallet.
- **Moving our own SANTA is taxed too:** seeding a $50 pool takes about $51.55 sent.

#### Open question for Cody: winners' payouts are taxed too
Paying a winner from the pool is a transfer, so 3% comes off. Two ways (both keep the pool healthy;
simulated 5,000 × 3,000 $1 spins from a $50 start, zero pauses either way):
- **A. Winner absorbs it:** a 2× win sends $2.00, the player receives $1.94. Players get back 72.3¢ per $1 on
  average; the pool keeps 13.1¢.
- **B. Pool tops it up (Claude's pick):** the pool sends $2.06 so the player receives the full $2.00, matching
  what the wheel shows. Players get back 74.5¢ per $1; the pool keeps 10.8¢. The "must cover the biggest win"
  rule then needs 5.16× the bet, not 5×.
The same choice applies to lottery prizes.

### How to make it work (proposals)
- **One transaction does the whole split.** When a player buys, their wallet signs a single transaction
  that burns their half directly from their own SANTA (a real burn that lowers total supply, not a send
  to a dead address) and sends the other half to the treasury. Nothing sits with us in between, and
  anyone can check it on a Solana explorer.
- **Price quote.** Look up the SANTA price when the player taps Buy (for example from DexScreener or
  Jupiter), lock it for about 60 seconds, and show "$0.50 ≈ 642 SANTA" before they sign.
- **Server confirms before granting.** The server checks the transaction on-chain (Cody already has
  Helius), then adds the item or tickets. A payment that doesn't confirm grants nothing.
- **Lottery.** Entries go into a lottery wallet; the draw uses verifiable on-chain randomness (the site's
  Advent draws already work this way); 90% is paid to winners and 10% burned in the same payout.
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
  The pool typically grew to about $220, and the worst 1% ended around $155.
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
