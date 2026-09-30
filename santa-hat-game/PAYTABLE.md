# Big Hat slot machine: full payout table

*Generated from `mockups/slots.js` by `tests/paytable.mjs`. Everything here is a **draft** for Cody to change.*

## The game at a glance

| | |
|---|---|
| Price | **$1.00 a pull**, paid in SANTA |
| Grid | **5 reels × 5 rows** (25 squares) |
| Paylines | **11**, straight or diagonal, always starting on the first reel (listed at the bottom; short diagonals are 3 or 4 squares). Only the longest run on a line pays; all winning lines add up. |
| Top line prize | **5 Santa Hats in a row = 100× = $100.00**, about 1 in 11,054 pulls |
| Pays back | **75.5%** of what's played: line prizes 62.3% + hat bonus 13.2% (exact, from the reel math) |
| Hat bonus | **Every Santa Hat anywhere on the grid pays $0.05**, on top of line prizes (about 2.6 hats a pull on average) |
| Pays something | **95.9%** of pulls: 62.1% are micro wins (less than the $1 pull back), 33.8% come out ahead |
| Pool jackpot | Its own draw: **1 in 25,000 pulls**. Pays **25% of the Slots pool**; all 25 squares show Santa Hats |
| Winners receive | The prize minus SANTA's **3% token tax** (a $100 prize arrives as $97.00) |

## Payout table

Chance "per pull" counts all 11 lines (5 in a row can only happen on the 7 full-length lines).
"Share of payback" is how much of the 75.5% each prize accounts for. Wild help is included.
The hat bonus is listed at the bottom.

| Symbol | Needs | Pays | $ on a $1 pull | Chance per pull | Share of payback |
|---|---|---|---|---|---|
| Santa Hat | 5 in a row | **100×** | $100.00 | 1 in 11,054 | 0.90% |
| Santa Hat | 4 in a row | **5×** | $5.00 | 1 in 1,233 | 0.41% |
| Santa Hat | 3 in a row | **1.4×** | $1.40 | 1 in 117 | 1.20% |
| Gold Star | 5 in a row | **50×** | $50.00 | 1 in 2,824 | 1.77% |
| Gold Star | 4 in a row | **3.5×** | $3.50 | 1 in 396 | 0.88% |
| Gold Star | 3 in a row | **1.4×** | $1.40 | 1 in 55 | 2.53% |
| Reindeer | 5 in a row | **10×** | $10.00 | 1 in 2,824 | 0.35% |
| Reindeer | 4 in a row | **3×** | $3.00 | 1 in 396 | 0.76% |
| Reindeer | 3 in a row | **1.3×** | $1.30 | 1 in 55 | 2.35% |
| Snowman | 5 in a row | **7×** | $7.00 | 1 in 1,676 | 0.42% |
| Snowman | 4 in a row | **2.5×** | $2.50 | 1 in 254 | 0.98% |
| Snowman | 3 in a row | **1.2×** | $1.20 | 1 in 38 | 3.18% |
| Present | 5 in a row | **5×** | $5.00 | 1 in 1,814 | 0.28% |
| Present | 4 in a row | **2×** | $2.00 | 1 in 254 | 0.79% |
| Present | 3 in a row | **1.15×** | $1.15 | 1 in 38 | 3.05% |
| Lantern | 5 in a row | **4×** | $4.00 | 1 in 1,139 | 0.35% |
| Lantern | 4 in a row | **1.6×** | $1.60 | 1 in 175 | 0.92% |
| Lantern | 3 in a row | **1.1×** | $1.10 | 1 in 28 | 3.99% |
| Pine Tree | 5 in a row | **3×** | $3.00 | 1 in 519 | 0.58% |
| Pine Tree | 4 in a row | **1.4×** | $1.40 | 1 in 102 | 1.37% |
| Pine Tree | 3 in a row | **1.05×** | $1.05 | 1 in 17 | 6.32% |
| Sleigh Bell | 5 in a row | **2.5×** | $2.50 | 1 in 268 | 0.93% |
| Sleigh Bell | 4 in a row | **1.3×** | $1.30 | 1 in 60 | 2.17% |
| Sleigh Bell | 3 in a row | **1.05×** | $1.05 | 1 in 11 | 9.46% |
| Snowball | 5 in a row | **25×** | $25.00 | 1 in 357 | 7.01% |
| Snowball | 4 in a row | **1.2×** | $1.20 | 1 in 77 | 1.55% |
| Snowball | 3 in a row | **1.05×** | $1.05 | 1 in 13 | 7.81% |
| Santa Hat bonus | each hat, anywhere | **0.05×** | $0.05 per hat | about 2.6 hats a pull (10.5% of squares) | 13.16% |
| **Total** | | | | | **75.47%** |

Coal pays nothing (it's the dud). Pool jackpot not included above (it's paid from the pool and grows with it).

## What a normal pull pays (pool jackpot not included)

Simulated 399,983 pulls. Biggest normal pull seen: **$102.85** (several lines at once can pass $100).

| A pull pays | How often |
|---|---|
| $0 (nothing) | 4.12% (1 in 24) |
| 5¢ to 99¢ (hat nickels, less than the pull back) | 62.10% (1 in 2) |
| $1 to $1.99 | 24.66% (1 in 4) |
| $2 to $4.99 | 8.37% (1 in 12) |
| $5 to $9.99 | 0.39% (1 in 260) |
| $10 to $24.99 | 0.04% (1 in 2,367) |
| $25 to $49.99 | 0.27% (1 in 364) |
| $50 to $99.99 | 0.04% (1 in 2,703) |
| $100 and up | 0.01% (1 in 11,111) |

The pool jackpot (25% of the pool, 1 in 25,000) comes on top of these.

## Santa Hat is WILD

- A Santa Hat **stands in for any symbol except Coal**, so it helps finish lines: Star, Hat, Star, Star = **4 Stars**.
- A line pays **the better of** its Santa Hats alone or the symbol they help complete.
- **5 Santa Hats in a row** on a line is the **100×** top prize.
- The chances in the table already include help from wilds (worked out exactly over every symbol combination).

## Reel strips

Every reel carries the same 76 symbols, in a different order on each reel (order doesn't change the odds). No reel has
two Santa Hats next to each other, so a full grid of hats only ever comes from the pool jackpot.

| Symbol | On each reel | Chance to land in a square |
|---|---|---|
| Santa Hat | 8 of 76 | 10.5% |
| Gold Star | 3 of 76 | 3.9% |
| Reindeer | 3 of 76 | 3.9% |
| Snowman | 4 of 76 | 5.3% |
| Present | 4 of 76 | 5.3% |
| Lantern | 5 of 76 | 6.6% |
| Pine Tree | 7 of 76 | 9.2% |
| Sleigh Bell | 9 of 76 | 11.8% |
| Snowball | 8 of 76 | 10.5% |
| Coal | 25 of 76 | 32.9% |

## Teasers (they happen naturally)

Results come straight from where the reels stop, so "almost" moments happen on their own, at their real odds.
Nothing is staged.

| On the best line, Santa Hats from the left | How often | What it pays |
|---|---|---|
| 2 hats, then something else | 1 in 9 pulls | nothing on their own; as wilds they can still finish another symbol's line |
| 3 hats, then something else | 1 in 84 pulls | 1.4× ($1.40), or more if they finish a better line |
| 4 hats, then something else | 1 in 998 pulls | 5× ($5.00), or more if they finish a better line |
| 5 hats | 1 in 11,054 pulls | **100× ($100.00)** |

## Where each $1 goes

| | |
|---|---|
| SANTA token tax | $0.03 |
| Burned | $0.10 |
| Into the Slots pool (after the tax on the transfer) | $0.88 |
| Paid back to players (line prizes + hat bonus), on average | $0.75 |
| Left in the pool for the pool jackpot and the treasury skim | $0.12 |

## Pool rules (draft)

- Starts at **$500.00** in the demo. A pull only starts if the pool can cover the biggest line prize ($100.00).
- When the pool reaches **$1775.00**, **$25.00** goes to the treasury (arrives as $24.25).
- Simulated 60 runs × 20,000 pulls from $500.00: the pool's lowest point in any run was **$404.36**;
  **0 pulls were refused** (pool too low); pools settled around **$1750.15**; the pool jackpot's typical
  size was **$389.76**; the treasury received about **$954.64 per 20,000 pulls**.
- **Top-off:** if the pool is ever below **$150.00** (before or after a pull), the treasury tops it back up
  to **$500.00**. That's above the $100.00 top prize, so the game can't lock.
- **Emergency stop:** Cody can pause the pool: no pulls and no top-offs, so funds can be withdrawn safely.
- All of these numbers are adjustable settings (`POOL_RULES` in `mockups/slots.js`; admin settings on the real server).

## Paylines

**Line 1**<br>· · · · ·<br>· · · · ·<br>■ ■ ■ ■ ■<br>· · · · ·<br>· · · · ·

**Line 2**<br>· · · · ·<br>■ ■ ■ ■ ■<br>· · · · ·<br>· · · · ·<br>· · · · ·

**Line 3**<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>■ ■ ■ ■ ■<br>· · · · ·

**Line 4**<br>■ ■ ■ ■ ■<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>· · · · ·

**Line 5**<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>· · · · ·<br>■ ■ ■ ■ ■

**Line 6**<br>■ · · · ·<br>· ■ · · ·<br>· · ■ · ·<br>· · · ■ ·<br>· · · · ■

**Line 7**<br>· · · · ■<br>· · · ■ ·<br>· · ■ · ·<br>· ■ · · ·<br>■ · · · ·

**Line 8**<br>· · · · ·<br>■ · · · ·<br>· ■ · · ·<br>· · ■ · ·<br>· · · ■ ·

**Line 9**<br>· · · ■ ·<br>· · ■ · ·<br>· ■ · · ·<br>■ · · · ·<br>· · · · ·

**Line 10**<br>· · · · ·<br>· · · · ·<br>■ · · · ·<br>· ■ · · ·<br>· · ■ · ·

**Line 11**<br>· · ■ · ·<br>· ■ · · ·<br>■ · · · ·<br>· · · · ·<br>· · · · ·
