# Big Hat slot machine: full payout table

*Generated from `mockups/slots.js` by `tests/paytable.mjs`. Everything here is a **draft** for Cody to change.*

## The game at a glance

| | |
|---|---|
| Price | **$1.00 a pull**, paid in SANTA |
| Grid | **5 reels × 5 rows** (25 squares) |
| Paylines | **15** (listed at the bottom). Wins count from the leftmost reel. Only the longest run on a line pays; all winning lines add up. |
| Top line prize | **5 Santa Hats in a row = 100× = $100.00**, about 1 in 24,753 pulls |
| Pays back | **74.9%** of what's played: line prizes 65.2% + hat bonus 9.6% (exact, from the reel math) |
| Hat bonus | **Every Santa Hat anywhere on the grid pays $0.05**, on top of line prizes (about 1.9 hats a pull on average) |
| Pays something | **90.2%** of pulls: 61.3% are micro wins (less than the $1 pull back), 29.0% come out ahead |
| Pool jackpot | Its own draw: **1 in 2,500 pulls**. Pays **10% of the Slots pool**; all 25 squares show Santa Hats |
| Winners receive | The prize minus SANTA's **3% token tax** (a $100 prize arrives as $97.00) |

## Payout table

Chance "per line" is for one payline; "per pull" is across all 15 lines (about 15× more likely).
"Share of payback" is how much of the 74.9% each prize accounts for. Wild help is included.
The hat bonus is listed at the bottom.

| Symbol | Needs | Pays | $ on a $1 pull | Chance per line | Chance per pull | Share of payback |
|---|---|---|---|---|---|---|
| Santa Hat | 5 in a row | **100×** | $100.00 | 1 in 371,293 | 1 in 24,753 | 0.40% |
| Santa Hat | 4 in a row | **10×** | $10.00 | 1 in 34,379 | 1 in 2,292 | 0.44% |
| Santa Hat | 3 in a row | **2.5×** | $2.50 | 1 in 3,080 | 1 in 205 | 1.22% |
| Gold Star | 5 in a row | **25×** | $25.00 | 1 in 39,142 | 1 in 2,609 | 0.96% |
| Gold Star | 4 in a row | **6×** | $6.00 | 1 in 5,865 | 1 in 391 | 1.53% |
| Gold Star | 3 in a row | **2×** | $2.00 | 1 in 809 | 1 in 54 | 3.71% |
| Reindeer | 5 in a row | **15×** | $15.00 | 1 in 39,142 | 1 in 2,609 | 0.57% |
| Reindeer | 4 in a row | **4×** | $4.00 | 1 in 5,865 | 1 in 391 | 1.02% |
| Reindeer | 3 in a row | **1.7×** | $1.70 | 1 in 809 | 1 in 54 | 3.15% |
| Snowman | 5 in a row | **9×** | $9.00 | 1 in 21,719 | 1 in 1,448 | 0.62% |
| Snowman | 4 in a row | **3×** | $3.00 | 1 in 3,490 | 1 in 233 | 1.29% |
| Snowman | 3 in a row | **1.5×** | $1.50 | 1 in 528 | 1 in 35 | 4.26% |
| Present | 5 in a row | **6×** | $6.00 | 1 in 21,719 | 1 in 1,448 | 0.41% |
| Present | 4 in a row | **2.5×** | $2.50 | 1 in 3,812 | 1 in 254 | 0.98% |
| Present | 3 in a row | **1.4×** | $1.40 | 1 in 528 | 1 in 35 | 3.98% |
| Lantern | 5 in a row | **4.5×** | $4.50 | 1 in 12,376 | 1 in 825 | 0.55% |
| Lantern | 4 in a row | **2×** | $2.00 | 1 in 2,411 | 1 in 161 | 1.24% |
| Lantern | 3 in a row | **1.3×** | $1.30 | 1 in 371 | 1 in 25 | 5.26% |
| Pine Tree | 5 in a row | **3.5×** | $3.50 | 1 in 7,526 | 1 in 502 | 0.70% |
| Pine Tree | 4 in a row | **1.8×** | $1.80 | 1 in 1,620 | 1 in 108 | 1.67% |
| Pine Tree | 3 in a row | **1.2×** | $1.20 | 1 in 274 | 1 in 18 | 6.57% |
| Sleigh Bell | 5 in a row | **3×** | $3.00 | 1 in 4,808 | 1 in 321 | 0.94% |
| Sleigh Bell | 4 in a row | **1.6×** | $1.60 | 1 in 1,138 | 1 in 76 | 2.11% |
| Sleigh Bell | 3 in a row | **1.1×** | $1.10 | 1 in 210 | 1 in 14 | 7.85% |
| Snowball | 5 in a row | **2.5×** | $2.50 | 1 in 3,314 | 1 in 221 | 1.13% |
| Snowball | 4 in a row | **1.5×** | $1.50 | 1 in 828 | 1 in 55 | 2.72% |
| Snowball | 3 in a row | **1.1×** | $1.10 | 1 in 166 | 1 in 11 | 9.96% |
| Santa Hat bonus | each hat, anywhere | **0.05×** | $0.05 per hat | 7.7% per square | about 1.9 hats a pull | 9.62% |
| **Total** | | | | | | **74.86%** |

Coal pays nothing (it's the dud). Pool jackpot not included above (it's paid from the pool and grows with it).

## Santa Hat is WILD

- A Santa Hat **stands in for any symbol except Coal**, so it helps finish lines: Star, Hat, Star, Star = **4 Stars**.
- A line pays **the better of** its Santa Hats alone or the symbol they help complete.
- **5 Santa Hats in a row** on a line is the **100×** top prize.
- The chances in the table already include help from wilds (worked out exactly over every symbol combination).

## Reel strips

Every reel carries the same 65 symbols, in a different order on each reel (order doesn't change the odds). No reel has
two Santa Hats next to each other, so a full grid of hats only ever comes from the pool jackpot.

| Symbol | On each reel | Chance to land in a square |
|---|---|---|
| Santa Hat | 5 of 65 | 7.7% |
| Gold Star | 3 of 65 | 4.6% |
| Reindeer | 3 of 65 | 4.6% |
| Snowman | 4 of 65 | 6.2% |
| Present | 4 of 65 | 6.2% |
| Lantern | 5 of 65 | 7.7% |
| Pine Tree | 6 of 65 | 9.2% |
| Sleigh Bell | 7 of 65 | 10.8% |
| Snowball | 8 of 65 | 12.3% |
| Coal | 20 of 65 | 30.8% |

## Teasers (they happen naturally)

Results come straight from where the reels stop, so "almost" moments happen on their own, at their real odds.
Nothing is staged.

| On the best line, Santa Hats from the left | How often | What it pays |
|---|---|---|
| 2 hats, then something else | 1 in 15 pulls | nothing on their own; as wilds they can still finish another symbol's line |
| 3 hats, then something else | 1 in 190 pulls | 2.5× ($2.50), or more if they finish a better line |
| 4 hats, then something else | 1 in 2,073 pulls | 10× ($10.00), or more if they finish a better line |
| 5 hats | 1 in 24,753 pulls | **100× ($100.00)** |

## Where each $1 goes

| | |
|---|---|
| SANTA token tax | $0.03 |
| Burned | $0.10 |
| Into the Slots pool (after the tax on the transfer) | $0.88 |
| Paid back to players (line prizes + hat bonus), on average | $0.75 |
| Left in the pool for the pool jackpot and the treasury skim | $0.13 |

## Pool rules (draft)

- Starts at **$250.00** in the demo. A pull only starts if the pool can cover the biggest line prize ($100.00).
- When the pool reaches **$1025.00**, **$25.00** goes to the treasury (arrives as $24.25).
- Simulated 60 runs × 20,000 pulls from $250.00: the pool's lowest point in any run was **$150.35**;
  **0 pulls were refused** (pool too low); pools settled around **$1000.54**; the pool jackpot's typical
  size was **$97.38**; the treasury received about **$1066.60 per 20,000 pulls**.
- If the pool ever did drop under $100.00, pulls would stop and nothing would refill it; a treasury refill rule
  (e.g. top it back up to $250) is the safety net. With the $1025 skim point this hasn't happened in simulation.

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
