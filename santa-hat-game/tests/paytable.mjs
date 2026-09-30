// Writes santa-hat-game/PAYTABLE.md: the full Big Hat payout table (a "PAR sheet") from the live settings in
// mockups/slots.js. Re-run after any change: node tests/paytable.mjs
import { writeFileSync } from 'fs';
import { MACHINES, SYMBOLS, IN_PER_DOLLAR, FEE, BURN, START_POOL, SKIM_AT, SKIM, POOL_RULES, MAX_FIXED, stats, pull } from '../mockups/slots.js';
import { rng } from './rng.mjs';

const m = MACHINES.big, s = stats(m), L = m.stripLen, lines = m.lines.length, rand = rng(2026);
const f = (id) => (m.counts[id] || 0) / L;
const oneIn = (p) => (p > 0 ? '1 in ' + Math.round(1 / p).toLocaleString() : 'never');
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const usd = (x) => '$' + x.toFixed(2);

// simulated per-pull numbers (lines overlap, so these need a simulation)
const N = 400000, st = { pool: 1e12, skimAt: Infinity }; let hit = 0, micro = 0, ahead = 0, back = 0, jp = 0, maxPay = 0;
const BANDS = [[0, 0, '$0 (nothing)'], [0.01, 0.99, '5¢ to 99¢ (hat nickels, less than the pull back)'], [1, 1.99, '$1 to $1.99'], [2, 4.99, '$2 to $4.99'],
  [5, 9.99, '$5 to $9.99'], [10, 24.99, '$10 to $24.99'], [25, 49.99, '$25 to $49.99'], [50, 99.99, '$50 to $99.99'], [100, Infinity, '$100 and up']];
const bandCount = BANDS.map(() => 0);
const tease = { 2: 0, 3: 0, 4: 0 };
for (let i = 0; i < N; i++) {
  const r = pull(st, 'big', rand); if (r.jackpot) { jp++; continue; }
  const pay = r.pay; back += pay; maxPay = Math.max(maxPay, pay);
  { const p = Math.round(pay * 100) / 100; bandCount[BANDS.findIndex(([lo, hi]) => p >= lo - 1e-9 && p <= hi + 1e-9)]++; }
  if (pay > 0) hit++; if (pay > m.bet + 1e-9) ahead++; else if (pay > 0) micro++;
  // teasers: the longest run of Santa Hats from the left on any line, when it falls short of 5
  let best = 0; for (const rows of m.lines) { let n = 0; while (n < m.reels && r.grid[n][rows[n]] === 0) n++; best = Math.max(best, n); }
  if (best >= 2 && best < 5) tease[best]++;
}

// Pool over time, with the real skim rule: lowest point, refused pulls, jackpot size, treasury income.
const POOL_RUNS = 60; let poolLow = Infinity, poolPaused = 0; const poolEnds = [], jps = []; let treasury = 0;
for (let run = 0; run < POOL_RUNS; run++) {
  const ps = { pool: START_POOL, treasury: 0 };
  for (let i = 0; i < 20000; i++) { const r = pull(ps, 'big', rand); if (r.paused) { poolPaused++; continue; } if (r.jackpot) jps.push(r.pay); poolLow = Math.min(poolLow, ps.pool); }
  poolEnds.push(ps.pool); treasury += ps.treasury;
}
poolEnds.sort((a, b) => a - b); jps.sort((a, b) => a - b);
const poolMedianEnd = poolEnds[POOL_RUNS >> 1], jpMedian = jps[jps.length >> 1] || 0, treasuryPer20k = treasury / POOL_RUNS;

const rowsOut = [];
let total = 0;
for (const sym of SYMBOLS) {
  const p = m.pays[sym.id]; if (!p) continue;
  for (const n of Object.keys(p).map(Number).sort((a, b) => b - a)) {
    const x = p[n], pl = s.each[sym.id + ':' + n] || 0, contrib = pl * x * lines; total += contrib;
    rowsOut.push(`| ${sym.name} | ${n} in a row | **${x}×** | ${usd(x * m.bet)} | ${oneIn(pl)} | ${oneIn(pl * lines)} | ${pct(contrib, 2)} |`);
  }
}
const grid = (rows) => Array.from({ length: m.rows }, (_, r) => rows.map((rr) => (rr === r ? '■' : '·')).join(' ')).join('<br>');

const md = `# Big Hat slot machine: full payout table

*Generated from \`mockups/slots.js\` by \`tests/paytable.mjs\`. Everything here is a **draft** for Cody to change.*

## The game at a glance

| | |
|---|---|
| Price | **${usd(m.bet)} a pull**, paid in SANTA |
| Grid | **${m.reels} reels × ${m.rows} rows** (25 squares) |
| Paylines | **${lines}** (listed at the bottom). Wins count from the leftmost reel. Only the longest run on a line pays; all winning lines add up. |
| Top line prize | **5 Santa Hats in a row = 100× = ${usd(100 * m.bet)}**, about ${oneIn(s.topPerLine * lines)} pulls |
| Pays back | **${pct(s.payback)}** of what's played: line prizes ${pct(s.linePayback)} + hat bonus ${pct(s.hatPayback)} (exact, from the reel math) |
| Hat bonus | **Every Santa Hat anywhere on the grid pays ${usd(m.hatBonus * m.bet)}**, on top of line prizes (about ${(25 * f('hat')).toFixed(1)} hats a pull on average) |
| Pays something | **${pct(hit / N)}** of pulls: ${pct(micro / N)} are micro wins (less than the $1 pull back), ${pct(ahead / N)} come out ahead |
| Pool jackpot | Its own draw: **${oneIn(m.poolJackpotOdds)} pulls**. Pays **${m.jackpotPct * 100}% of the Slots pool**; all 25 squares show Santa Hats |
| Winners receive | The prize minus SANTA's **${FEE * 100}% token tax** (a $100 prize arrives as ${usd(100 * (1 - FEE))}) |

## Payout table

Chance "per line" is for one payline; "per pull" is across all ${lines} lines (about ${lines}× more likely).
"Share of payback" is how much of the ${pct(s.payback)} each prize accounts for. Wild help is included.
The hat bonus is listed at the bottom.

| Symbol | Needs | Pays | $ on a $1 pull | Chance per line | Chance per pull | Share of payback |
|---|---|---|---|---|---|---|
${rowsOut.join('\n')}
| Santa Hat bonus | each hat, anywhere | **${m.hatBonus}×** | ${usd(m.hatBonus * m.bet)} per hat | ${pct(f('hat'))} per square | about ${(25 * f('hat')).toFixed(1)} hats a pull | ${pct(s.hatPayback, 2)} |
| **Total** | | | | | | **${pct(total + s.hatPayback, 2)}** |

Coal pays nothing (it's the dud). Pool jackpot not included above (it's paid from the pool and grows with it).

## What a normal pull pays (pool jackpot not included)

Simulated ${(N - jp).toLocaleString()} pulls. Biggest normal pull seen: **${usd(maxPay)}** (several lines at once can pass $100).

| A pull pays | How often |
|---|---|
${BANDS.map(([, , label], i) => `| ${label} | ${pct(bandCount[i] / (N - jp), 2)} (${bandCount[i] ? oneIn(bandCount[i] / (N - jp)) : 'not seen in this sample'}) |`).join('\n')}

The pool jackpot (${m.jackpotPct * 100}% of the pool, ${oneIn(m.poolJackpotOdds)}) comes on top of these.

## Santa Hat is WILD

- A Santa Hat **stands in for any symbol except Coal**, so it helps finish lines: Star, Hat, Star, Star = **4 Stars**.
- A line pays **the better of** its Santa Hats alone or the symbol they help complete.
- **5 Santa Hats in a row** on a line is the **100×** top prize.
- The chances in the table already include help from wilds (worked out exactly over every symbol combination).

## Reel strips

Every reel carries the same ${L} symbols, in a different order on each reel (order doesn't change the odds). No reel has
two Santa Hats next to each other, so a full grid of hats only ever comes from the pool jackpot.

| Symbol | On each reel | Chance to land in a square |
|---|---|---|
${SYMBOLS.map((x) => `| ${x.name} | ${m.counts[x.id] || 0} of ${L} | ${pct(f(x.id))} |`).join('\n')}

## Teasers (they happen naturally)

Results come straight from where the reels stop, so "almost" moments happen on their own, at their real odds.
Nothing is staged.

| On the best line, Santa Hats from the left | How often | What it pays |
|---|---|---|
| 2 hats, then something else | ${oneIn(tease[2] / N)} pulls | nothing on their own; as wilds they can still finish another symbol's line |
| 3 hats, then something else | ${oneIn(tease[3] / N)} pulls | ${m.pays.hat[3]}× (${usd(m.pays.hat[3] * m.bet)}), or more if they finish a better line |
| 4 hats, then something else | ${oneIn(tease[4] / N)} pulls | ${m.pays.hat[4]}× (${usd(m.pays.hat[4] * m.bet)}), or more if they finish a better line |
| 5 hats | ${oneIn(s.topPerLine * lines)} pulls | **100× (${usd(100 * m.bet)})** |

## Where each $1 goes

| | |
|---|---|
| SANTA token tax | ${usd(FEE)} |
| Burned | ${usd(BURN * (1 - FEE))} |
| Into the Slots pool (after the tax on the transfer) | ${usd(IN_PER_DOLLAR)} |
| Paid back to players (line prizes + hat bonus), on average | ${usd(s.payback)} |
| Left in the pool for the pool jackpot and the treasury skim | ${usd(IN_PER_DOLLAR - s.payback)} |

## Pool rules (draft)

- Starts at **${usd(START_POOL)}** in the demo. A pull only starts if the pool can cover the biggest line prize (${usd(MAX_FIXED(m))}).
- When the pool reaches **${usd(SKIM_AT)}**, **${usd(SKIM)}** goes to the treasury (arrives as ${usd(SKIM * (1 - FEE))}).
- Simulated ${POOL_RUNS} runs × 20,000 pulls from ${usd(START_POOL)}: the pool's lowest point in any run was **${usd(poolLow)}**;
  **${poolPaused} pulls were refused** (pool too low); pools settled around **${usd(poolMedianEnd)}**; the pool jackpot's typical
  size was **${usd(jpMedian)}**; the treasury received about **${usd(treasuryPer20k)} per 20,000 pulls**.
- **Top-off:** if the pool is ever below **${usd(POOL_RULES.topOffBelow)}** (before or after a pull), the treasury tops it back up
  to **${usd(POOL_RULES.topOffTo)}**. That's above the ${usd(MAX_FIXED(m))} top prize, so the game can't lock.
- **Emergency stop:** Cody can pause the pool: no pulls and no top-offs, so funds can be withdrawn safely.
- All of these numbers are adjustable settings (\`POOL_RULES\` in \`mockups/slots.js\`; admin settings on the real server).

## Paylines

${m.lines.map((rows, i) => `**Line ${i + 1}**<br>${grid(rows)}`).join('\n\n')}
`;
writeFileSync(new URL('../PAYTABLE.md', import.meta.url), md);
console.log(`wrote PAYTABLE.md: payback ${pct(s.payback)}, any win ${pct(hit / N)}, teasers 2/3/4 hats: ${oneIn(tease[2] / N)} / ${oneIn(tease[3] / N)} / ${oneIn(tease[4] / N)}`);
