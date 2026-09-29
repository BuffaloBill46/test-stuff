// Writes santa-hat-game/PAYTABLE.md: the full Big Hat payout table (a "PAR sheet") from the live settings in
// mockups/slots.js. Re-run after any change: node tests/paytable.mjs
import { writeFileSync } from 'fs';
import { MACHINES, SYMBOLS, IN_PER_DOLLAR, FEE, BURN, START_POOL, SKIM_AT, SKIM, MAX_FIXED, stats, pull } from '../mockups/slots.js';
import { rng } from './rng.mjs';

const m = MACHINES.big, s = stats(m), L = m.stripLen, lines = m.lines.length, rand = rng(2026);
const f = (id) => (m.counts[id] || 0) / L;
const oneIn = (p) => (p > 0 ? '1 in ' + Math.round(1 / p).toLocaleString() : 'never');
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const usd = (x) => '$' + x.toFixed(2);

// simulated per-pull numbers (lines overlap, so these need a simulation)
const N = 400000, st = { pool: 1e12, skimAt: Infinity }; let hit = 0, micro = 0, ahead = 0, back = 0, jp = 0;
const tease = { 2: 0, 3: 0, 4: 0 };
for (let i = 0; i < N; i++) {
  const r = pull(st, 'big', rand); if (r.jackpot) { jp++; continue; }
  const pay = r.wins.reduce((a, w) => a + w.pay, 0); back += pay;
  if (r.wins.length) hit++; if (pay > m.bet + 1e-9) ahead++; else if (pay > 0) micro++;
  // teasers: the longest run of Santa Hats from the left on any line, when it falls short of 5
  let best = 0; for (const rows of m.lines) { let n = 0; while (n < m.reels && r.grid[n][rows[n]] === 0) n++; best = Math.max(best, n); }
  if (best >= 2 && best < 5) tease[best]++;
}

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
| Line wins pay back | **${pct(s.payback)}** of what's played (exact, from the reel math) |
| Any win | **${pct(hit / N)}** of pulls: ${pct(micro / N)} are micro wins (less than the $1 pull back), ${pct(ahead / N)} come out ahead |
| Pool jackpot | Its own draw: **${oneIn(m.poolJackpotOdds)} pulls**. Pays **${m.jackpotPct * 100}% of the Slots pool**; all 25 squares show Santa Hats |
| Winners receive | The prize minus SANTA's **${FEE * 100}% token tax** (a $100 prize arrives as ${usd(100 * (1 - FEE))}) |

## Payout table

Chance "per line" is for one payline; "per pull" is across all ${lines} lines (about ${lines}× more likely).
"Share of payback" is how much of the ${pct(s.payback)} each prize accounts for. Wild help is included.

| Symbol | Needs | Pays | $ on a $1 pull | Chance per line | Chance per pull | Share of payback |
|---|---|---|---|---|---|---|
${rowsOut.join('\n')}
| **Total** | | | | | | **${pct(total, 2)}** |

Coal pays nothing (it's the dud). Pool jackpot not included above (it's paid from the pool and grows with it).

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
| Paid back to players from line wins, on average | ${usd(s.payback)} |
| Left in the pool for the pool jackpot and the treasury skim | ${usd(IN_PER_DOLLAR - s.payback)} |

## Pool rules (draft)

- Starts at **${usd(START_POOL)}** in the demo. A pull only starts if the pool can cover the biggest line prize (${usd(MAX_FIXED(m))}).
- When the pool reaches **${usd(SKIM_AT)}**, **${usd(SKIM)}** goes to the treasury (arrives as ${usd(SKIM * (1 - FEE))}).
- With the pool capped at ${usd(SKIM_AT)}, a ${m.jackpotPct * 100}% pool jackpot is only about $25–32 (less than the $100 line prize).
- **Needs a decision:** if the pool drops under ${usd(MAX_FIXED(m))}, pulls can't start and nothing refills it, so the game
  locks. Proposal: the treasury tops the pool back up to $250 whenever it falls below $150. Simulated with the skim: never
  locked, and the treasury still came out about $2,250 ahead per 20,000 pulls (worst run +$1,400).

## Paylines

${m.lines.map((rows, i) => `**Line ${i + 1}**<br>${grid(rows)}`).join('\n\n')}
`;
writeFileSync(new URL('../PAYTABLE.md', import.meta.url), md);
console.log(`wrote PAYTABLE.md: payback ${pct(s.payback)}, any win ${pct(hit / N)}, teasers 2/3/4 hats: ${oneIn(tease[2] / N)} / ${oneIn(tease[3] / N)} / ${oneIn(tease[4] / N)}`);
