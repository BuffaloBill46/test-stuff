# Big Hat slot machine: full payout table

*Generated from `mockups/slots.js` by `tests/paytable.mjs`. Everything here is a **draft** for Cody to change.*

## The game at a glance

| | |
|---|---|
| Price | **$1.00 a pull**, paid in SANTA |
| Grid | **5 reels × 5 rows** (25 squares) |
| Paylines | **15** (listed at the bottom). Wins count from the leftmost reel. Only the longest run on a line pays; all winning lines add up. |
| Top line prize | **5 Santa Hats in a row = 100× = $100.00**, about 1 in 12,014 pulls |
| Line wins pay back | **74.7%** of what's played (exact, from the reel math) |
| Any win | **54.0%** of pulls: 36.1% are micro wins (less than the $1 pull back), 17.9% come out ahead |
| Pool jackpot | Its own draw: **1 in 2,500 pulls**. Pays **10% of the Slots pool**; all 25 squares show Santa Hats |
| Winners receive | The prize minus SANTA's **3% token tax** (a $100 prize arrives as $97.00) |

## Payout table

Chance "per line" is for one payline; "per pull" is across all 15 lines (about 15× more likely).
"Share of payback" is how much of the 74.7% each prize accounts for. Wild help is included.

| Symbol | Needs | Pays | $ on a $1 pull | Chance per line | Chance per pull | Share of payback |
|---|---|---|---|---|---|---|
| Santa Hat | 5 in a row | **100×** | $100.00 | 1 in 180,203 | 1 in 12,014 | 0.83% |
| Santa Hat | 4 in a row | **12×** | $12.00 | 1 in 20,595 | 1 in 1,373 | 0.87% |
| Santa Hat | 3 in a row | **1.5×** | $1.50 | 1 in 2,791 | 1 in 186 | 0.81% |
| Gold Star | 5 in a row | **39×** | $39.00 | 1 in 11,692 | 1 in 779 | 5.00% |
| Gold Star | 4 in a row | **7.5×** | $7.50 | 1 in 2,264 | 1 in 151 | 4.97% |
| Gold Star | 3 in a row | **1.5×** | $1.50 | 1 in 387 | 1 in 26 | 5.82% |
| Reindeer | 5 in a row | **19×** | $19.00 | 1 in 11,692 | 1 in 779 | 2.44% |
| Reindeer | 4 in a row | **4.5×** | $4.50 | 1 in 2,264 | 1 in 151 | 2.98% |
| Reindeer | 3 in a row | **0.95×** | $0.95 | 1 in 387 | 1 in 26 | 3.68% |
| Snowman | 5 in a row | **12×** | $12.00 | 1 in 6,007 | 1 in 400 | 3.00% |
| Snowman | 4 in a row | **3×** | $3.00 | 1 in 1,299 | 1 in 87 | 3.46% |
| Snowman | 3 in a row | **0.6×** | $0.60 | 1 in 247 | 1 in 16 | 3.64% |
| Present | 5 in a row | **7.5×** | $7.50 | 1 in 6,007 | 1 in 400 | 1.87% |
| Present | 4 in a row | **2×** | $2.00 | 1 in 1,299 | 1 in 87 | 2.31% |
| Present | 3 in a row | **0.45×** | $0.45 | 1 in 247 | 1 in 16 | 2.73% |
| Lantern | 5 in a row | **4.5×** | $4.50 | 1 in 3,252 | 1 in 217 | 2.08% |
| Lantern | 4 in a row | **1×** | $1.00 | 1 in 856 | 1 in 57 | 1.75% |
| Lantern | 3 in a row | **0.3×** | $0.30 | 1 in 171 | 1 in 11 | 2.63% |
| Pine Tree | 5 in a row | **3×** | $3.00 | 1 in 1,894 | 1 in 126 | 2.38% |
| Pine Tree | 4 in a row | **0.75×** | $0.75 | 1 in 563 | 1 in 38 | 2.00% |
| Pine Tree | 3 in a row | **0.25×** | $0.25 | 1 in 125 | 1 in 8 | 3.00% |
| Sleigh Bell | 5 in a row | **2.5×** | $2.50 | 1 in 1,166 | 1 in 78 | 3.22% |
| Sleigh Bell | 4 in a row | **0.6×** | $0.60 | 1 in 389 | 1 in 26 | 2.31% |
| Sleigh Bell | 3 in a row | **0.15×** | $0.15 | 1 in 95 | 1 in 6 | 2.36% |
| Snowball | 5 in a row | **1.5×** | $1.50 | 1 in 770 | 1 in 51 | 2.92% |
| Snowball | 4 in a row | **0.5×** | $0.50 | 1 in 280 | 1 in 19 | 2.68% |
| Snowball | 3 in a row | **0.15×** | $0.15 | 1 in 75 | 1 in 5 | 3.01% |
| **Total** | | | | | | **74.74%** |

Coal pays nothing (it's the dud). Pool jackpot not included above (it's paid from the pool and grows with it).

## Santa Hat is WILD

- A Santa Hat **stands in for any symbol except Coal**, so it helps finish lines: Star, Hat, Star, Star = **4 Stars**.
- A line pays **the better of** its Santa Hats alone or the symbol they help complete.
- **5 Santa Hats in a row** on a line is the **100×** top prize.
- The chances in the table already include help from wilds (worked out exactly over every symbol combination).

## Reel strips

Every reel carries the same 45 symbols, in a different order on each reel (order doesn't change the odds). No reel has
two Santa Hats next to each other, so a full grid of hats only ever comes from the pool jackpot.

| Symbol | On each reel | Chance to land in a square |
|---|---|---|
| Santa Hat | 4 of 45 | 8.9% |
| Gold Star | 3 of 45 | 6.7% |
| Reindeer | 3 of 45 | 6.7% |
| Snowman | 4 of 45 | 8.9% |
| Present | 4 of 45 | 8.9% |
| Lantern | 5 of 45 | 11.1% |
| Pine Tree | 6 of 45 | 13.3% |
| Sleigh Bell | 7 of 45 | 15.6% |
| Snowball | 8 of 45 | 17.8% |
| Coal | 1 of 45 | 2.2% |

## Teasers (they happen naturally)

Results come straight from where the reels stop, so "almost" moments happen on their own, at their real odds.
Nothing is staged.

| On the best line, Santa Hats from the left | How often | What it pays |
|---|---|---|
| 2 hats, then something else | 1 in 11 pulls | nothing on their own; as wilds they can still finish another symbol's line |
| 3 hats, then something else | 1 in 119 pulls | 1.5× ($1.50), or more if they finish a better line |
| 4 hats, then something else | 1 in 1,262 pulls | 12× ($12.00), or more if they finish a better line |
| 5 hats | 1 in 12,014 pulls | **100× ($100.00)** |

## Where each $1 goes

| | |
|---|---|
| SANTA token tax | $0.03 |
| Burned | $0.10 |
| Into the Slots pool (after the tax on the transfer) | $0.88 |
| Paid back to players from line wins, on average | $0.75 |
| Left in the pool for the pool jackpot and the treasury skim | $0.13 |

## Pool rules (draft)

- Starts at **$250.00** in the demo. A pull only starts if the pool can cover the biggest line prize ($100.00).
- When the pool reaches **$325.00**, **$25.00** goes to the treasury (arrives as $24.25).
- With the pool capped at $325.00, a 10% pool jackpot is only about $25–32 (less than the $100 line prize).
- **Needs a decision:** if the pool drops under $100.00, pulls can't start and nothing refills it, so the game
  locks. Proposal: the treasury tops the pool back up to $250 whenever it falls below $150. Simulated with the skim: never
  locked, and the treasury still came out about $2,250 ahead per 20,000 pulls (worst run +$1,400).

## Paylines

**Line 1**<br>· · · · ·<br>· · · · ·<br>■ ■ ■ ■ ■<br>· · · · ·<br>· · · · ·

**Line 2**<br>· · · · ·<br>■ ■ ■ ■ ■<br>· · · · ·<br>· · · · ·<br>· · · · ·

**Line 3**<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>■ ■ ■ ■ ■<br>· · · · ·

**Line 4**<br>■ ■ ■ ■ ■<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>· · · · ·

**Line 5**<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>■ ■ ■ ■ ■

**Line 6**<br>■ · · · ·<br>· ■ · · ·<br>· · ■ · ·<br>· · · ■ ·<br>· · · · ■

**Line 7**<br>· · · · ■<br>· · · ■ ·<br>· · ■ · ·<br>· ■ · · ·<br>■ · · · ·

**Line 8**<br>■ · · · ■<br>· ■ · ■ ·<br>· · ■ · ·<br>· · · · ·<br>· · · · ·

**Line 9**<br>· · · · ·<br>· · · · ·<br>· · ■ · ·<br>· ■ · ■ ·<br>■ · · · ■

**Line 10**<br>· · · · ·<br>■ · · · ■<br>· ■ · ■ ·<br>· · ■ · ·<br>· · · · ·

**Line 11**<br>· · · · ·<br>· · ■ · ·<br>· ■ · ■ ·<br>■ · · · ■<br>· · · · ·

**Line 12**<br>· ■ · ■ ·<br>■ · ■ · ■<br>· · · · ·<br>· · · · ·<br>· · · · ·

**Line 13**<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>■ · ■ · ■<br>· ■ · ■ ·

**Line 14**<br>· · · · ·<br>· ■ · ■ ·<br>■ · ■ · ■<br>· · · · ·<br>· · · · ·

**Line 15**<br>· · · · ·<br>· · · · ·<br>■ · ■ · ■<br>· ■ · ■ ·<br>· · · · ·
