# Big Hat slot machine: full payout table

*Generated from `mockups/slots.js` by `tests/paytable.mjs`. Everything here is a **draft** for Cody to change.*

## The game at a glance

| | |
|---|---|
| Price | **$1.00 a pull**, paid in SANTA |
| Grid | **5 reels × 5 rows** (25 squares) |
| Paylines | **15** (listed at the bottom). Wins count from the leftmost reel. Only the longest run on a line pays; all winning lines add up. |
| Top line prize | **5 Santa Hats in a row = 100× = $100.00**, about 1 in 9,027 pulls |
| Pays back | **75.5%** of what's played: line prizes 63.8% + hat bonus 11.8% (exact, from the reel math) |
| Hat bonus | **Every Santa Hat anywhere on the grid pays $0.05**, on top of line prizes (about 2.4 hats a pull on average) |
| Pays something | **93.4%** of pulls: 65.3% are micro wins (less than the $1 pull back), 28.0% come out ahead |
| Pool jackpot | Its own draw: **1 in 25,000 pulls**. Pays **25% of the Slots pool**; all 25 squares show Santa Hats |
| Winners receive | The prize minus SANTA's **3% token tax** (a $100 prize arrives as $97.00) |

## Payout table

Chance "per line" is for one payline; "per pull" is across all 15 lines (about 15× more likely).
"Share of payback" is how much of the 75.5% each prize accounts for. Wild help is included.
The hat bonus is listed at the bottom.

| Symbol | Needs | Pays | $ on a $1 pull | Chance per line | Chance per pull | Share of payback |
|---|---|---|---|---|---|---|
| Santa Hat | 5 in a row | **100×** | $100.00 | 1 in 135,408 | 1 in 9,027 | 1.11% |
| Santa Hat | 4 in a row | **5×** | $5.00 | 1 in 18,360 | 1 in 1,224 | 0.41% |
| Santa Hat | 3 in a row | **1.4×** | $1.40 | 1 in 1,907 | 1 in 127 | 1.10% |
| Gold Star | 5 in a row | **50×** | $50.00 | 1 in 34,588 | 1 in 2,306 | 2.17% |
| Gold Star | 4 in a row | **3.5×** | $3.50 | 1 in 5,686 | 1 in 379 | 0.92% |
| Gold Star | 3 in a row | **1.4×** | $1.40 | 1 in 861 | 1 in 57 | 2.44% |
| Reindeer | 5 in a row | **10×** | $10.00 | 1 in 34,588 | 1 in 2,306 | 0.43% |
| Reindeer | 4 in a row | **3×** | $3.00 | 1 in 5,686 | 1 in 379 | 0.79% |
| Reindeer | 3 in a row | **1.3×** | $1.30 | 1 in 861 | 1 in 57 | 2.26% |
| Snowman | 5 in a row | **7×** | $7.00 | 1 in 20,536 | 1 in 1,369 | 0.51% |
| Snowman | 4 in a row | **2.5×** | $2.50 | 1 in 3,653 | 1 in 244 | 1.03% |
| Snowman | 3 in a row | **1.2×** | $1.20 | 1 in 588 | 1 in 39 | 3.06% |
| Present | 5 in a row | **5×** | $5.00 | 1 in 22,221 | 1 in 1,481 | 0.34% |
| Present | 4 in a row | **2×** | $2.00 | 1 in 3,653 | 1 in 244 | 0.82% |
| Present | 3 in a row | **1.15×** | $1.15 | 1 in 588 | 1 in 39 | 2.93% |
| Lantern | 5 in a row | **4×** | $4.00 | 1 in 13,951 | 1 in 930 | 0.43% |
| Lantern | 4 in a row | **1.6×** | $1.60 | 1 in 2,519 | 1 in 168 | 0.95% |
| Lantern | 3 in a row | **1.1×** | $1.10 | 1 in 430 | 1 in 29 | 3.83% |
| Pine Tree | 5 in a row | **3×** | $3.00 | 1 in 6,357 | 1 in 424 | 0.71% |
| Pine Tree | 4 in a row | **1.4×** | $1.40 | 1 in 1,476 | 1 in 98 | 1.42% |
| Pine Tree | 3 in a row | **1.05×** | $1.05 | 1 in 260 | 1 in 17 | 6.05% |
| Sleigh Bell | 5 in a row | **2.5×** | $2.50 | 1 in 3,286 | 1 in 219 | 1.14% |
| Sleigh Bell | 4 in a row | **1.3×** | $1.30 | 1 in 872 | 1 in 58 | 2.24% |
| Sleigh Bell | 3 in a row | **1.05×** | $1.05 | 1 in 174 | 1 in 12 | 9.03% |
| Snowball | 5 in a row | **25×** | $25.00 | 1 in 4,368 | 1 in 291 | 8.59% |
| Snowball | 4 in a row | **1.2×** | $1.20 | 1 in 1,121 | 1 in 75 | 1.61% |
| Snowball | 3 in a row | **1.05×** | $1.05 | 1 in 211 | 1 in 14 | 7.46% |
| Santa Hat bonus | each hat, anywhere | **0.05×** | $0.05 per hat | 9.4% per square | about 2.4 hats a pull | 11.76% |
| **Total** | | | | | | **75.55%** |

Coal pays nothing (it's the dud). Pool jackpot not included above (it's paid from the pool and grows with it).

## What a normal pull pays (pool jackpot not included)

Simulated 399,983 pulls. Biggest normal pull seen: **$154.65** (several lines at once can pass $100).

| A pull pays | How often |
|---|---|
| $0 (nothing) | 6.64% (1 in 15) |
| 5¢ to 99¢ (hat nickels, less than the pull back) | 65.31% (1 in 2) |
| $1 to $1.99 | 17.43% (1 in 6) |
| $2 to $4.99 | 9.24% (1 in 11) |
| $5 to $9.99 | 0.90% (1 in 111) |
| $10 to $24.99 | 0.09% (1 in 1,166) |
| $25 to $49.99 | 0.32% (1 in 308) |
| $50 to $99.99 | 0.05% (1 in 2,000) |
| $100 and up | 0.01% (1 in 8,000) |

The pool jackpot (25% of the pool, 1 in 25,000) comes on top of these.

## Santa Hat is WILD

- A Santa Hat **stands in for any symbol except Coal**, so it helps finish lines: Star, Hat, Star, Star = **4 Stars**.
- A line pays **the better of** its Santa Hats alone or the symbol they help complete.
- **5 Santa Hats in a row** on a line is the **100×** top prize.
- The chances in the table already include help from wilds (worked out exactly over every symbol combination).

## Reel strips

Every reel carries the same 85 symbols, in a different order on each reel (order doesn't change the odds). No reel has
two Santa Hats next to each other, so a full grid of hats only ever comes from the pool jackpot.

| Symbol | On each reel | Chance to land in a square |
|---|---|---|
| Santa Hat | 8 of 85 | 9.4% |
| Gold Star | 3 of 85 | 3.5% |
| Reindeer | 3 of 85 | 3.5% |
| Snowman | 4 of 85 | 4.7% |
| Present | 4 of 85 | 4.7% |
| Lantern | 5 of 85 | 5.9% |
| Pine Tree | 7 of 85 | 8.2% |
| Sleigh Bell | 9 of 85 | 10.6% |
| Snowball | 8 of 85 | 9.4% |
| Coal | 34 of 85 | 40.0% |

## Teasers (they happen naturally)

Results come straight from where the reels stop, so "almost" moments happen on their own, at their real odds.
Nothing is staged.

| On the best line, Santa Hats from the left | How often | What it pays |
|---|---|---|
| 2 hats, then something else | 1 in 11 pulls | nothing on their own; as wilds they can still finish another symbol's line |
| 3 hats, then something else | 1 in 111 pulls | 1.4× ($1.40), or more if they finish a better line |
| 4 hats, then something else | 1 in 1,026 pulls | 5× ($5.00), or more if they finish a better line |
| 5 hats | 1 in 9,027 pulls | **100× ($100.00)** |

## Where each $1 goes

| | |
|---|---|
| SANTA token tax | $0.03 |
| Burned | $0.10 |
| Into the Slots pool (after the tax on the transfer) | $0.88 |
| Paid back to players (line prizes + hat bonus), on average | $0.76 |
| Left in the pool for the pool jackpot and the treasury skim | $0.12 |

## Pool rules (draft)

- Starts at **$500.00** in the demo. A pull only starts if the pool can cover the biggest line prize ($100.00).
- When the pool reaches **$1775.00**, **$25.00** goes to the treasury (arrives as $24.25).
- Simulated 60 runs × 20,000 pulls from $500.00: the pool's lowest point in any run was **$364.55**;
  **0 pulls were refused** (pool too low); pools settled around **$1741.48**; the pool jackpot's typical
  size was **$363.20**; the treasury received about **$970.00 per 20,000 pulls**.
- If the pool ever did drop under $100.00, pulls would stop and nothing would refill it; a treasury refill rule
  (e.g. top it back up to $250) is the safety net. With the $1775 skim point this hasn't happened in simulation.

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
