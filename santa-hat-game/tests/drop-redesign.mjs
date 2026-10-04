// Cody's new Snowball Drop board (2026-10-02 sketch): 17 slots, mirror-image,
//   25× · 0 · 10× · 0 · 5× · 0 · 2× · 0 · 100× (centre) · 0 · 2× · 0 · 5× · 0 · 10× · 0 · 25×
// The maths for a few odds mixes, next to today's board: payback, how often you win, how swingy it is, and a million $1 and
// 10¢ drops against the REAL pool rules (Spin pool: starts $50, $25 skim at $175, top-off to $50 below $10, a drop only when
// the pool covers its top prize). Odds come from a table (the server picks the slot; the path is drawn to it), because on a
// real 50/50 peg board the centre is the MOST likely slot. Run: node drop-redesign.mjs
import { POOL_RULES as SPIN_RULES } from '../mockups/slots.js'; // the shared Game pool's rules
import { IN_PER_DOLLAR } from '../mockups/slots.js';
import { PAYS, WAYS, TOTAL } from '../mockups/plinko.js';

// each mix: chance of each prize (both sides together), the rest is 0×
const MIXES = {
  'TODAY (8 rows, 9 bins)': Object.fromEntries([...new Set(PAYS)].map((m) => [m, PAYS.reduce((a, p, k) => a + (p === m ? WAYS[k] : 0), 0) / TOTAL])),
  'A · 100× 1 in 10,000': { 100: 1 / 10000, 25: 0.004, 10: 0.012, 5: 0.04, 2: 0.175 },
  'B · 100× 1 in 5,000': { 100: 1 / 5000, 25: 0.004, 10: 0.012, 5: 0.04, 2: 0.17 },
  'C · 1 in 5,000, riskier': { 100: 1 / 5000, 25: 0.006, 10: 0.016, 5: 0.04, 2: 0.125 },
};
const pct = (x) => (x * 100).toFixed(2) + '%', oneIn = (p) => (p ? '1 in ' + (1 / p).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—');
function stats(m) {
  const e = Object.entries(m).reduce((a, [x, p]) => a + x * p, 0), e2 = Object.entries(m).reduce((a, [x, p]) => a + x * x * p, 0);
  const win = Object.entries(m).reduce((a, [x, p]) => a + (x > 1 ? p : 0), 0), zero = 1 - Object.values(m).reduce((a, p) => a + p, 0) + (m[0] || 0);
  return { payback: e, sd: Math.sqrt(e2 - e * e), win, zero, top: Math.max(...Object.keys(m).map(Number)) };
}
// a million drops of one size against the pool rules (seeded so the numbers repeat)
function simulate(m, bet, n = 1e6) {
  let seed = 12345; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const R = SPIN_RULES, table = Object.entries(m).filter(([x]) => +x > 0).map(([x, p]) => [+x, p]), top = Math.max(...table.map(([x]) => x));
  let pool = R.start, refused = 0, topOffs = 0, topOffMoney = 0, skims = 0, played = 0, paid = 0;
  for (let i = 0; i < n; i++) {
    if (pool < R.topOffBelow) { topOffs++; topOffMoney += R.topOffTo - pool; pool = R.topOffTo; }
    if (pool < top * bet) { refused++; pool += 0; continue; } // refused: no payment taken; a real player would try later
    pool += bet * IN_PER_DOLLAR; played++;
    let r = rand(), mult = 0; for (const [x, p] of table) { if (r < p) { mult = x; break; } r -= p; }
    pool -= mult * bet; paid += mult * bet;
    if (pool >= R.skimAt) { pool -= R.skim; skims++; }
  }
  return { refused: refused / n, topOffs, topOffMoney, skims, played };
}
for (const [name, m] of Object.entries(MIXES)) {
  const s = stats(m);
  console.log(`\n${name}`);
  console.log(`  prizes: ${Object.entries(m).filter(([x]) => +x > 0).sort((a, b) => b[0] - a[0]).map(([x, p]) => `${x}× ${oneIn(p)}`).join(' · ')}`);
  console.log(`  payback ${pct(s.payback)} · more back than paid ${pct(s.win)} (${oneIn(s.win)}) · nothing back ${pct(s.zero)} · swing (std dev per $1) ${s.sd.toFixed(2)}`);
  console.log(`  10 losses in a row: ${pct((1 - s.win) ** 10)} of the time`);
  for (const bet of [0.1, 1]) {
    const r = simulate(m, bet);
    console.log(`  ${bet === 1 ? '$1 ' : '10¢'} drops, 1M tries: refused ${pct(r.refused)} (pool under ${s.top}× = $${(s.top * bet).toFixed(0)}) · top-offs ${r.topOffs} ($${r.topOffMoney.toFixed(0)} of Cody's money) · $25 skims ${r.skims}`);
  }
}
