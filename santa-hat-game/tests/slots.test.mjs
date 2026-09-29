// Santa Hat Slots rules: invariants asserted, plus the numbers a PAR sheet would list for the current (DRAFT) settings.
// Run: node tests/slots.test.mjs
import { MACHINES, SYMBOLS, SYM, IN_PER_DOLLAR, START_POOL, MAX_FIXED, stats, gridFor, evaluate, pull, stopsShowing } from '../mockups/slots.js';
import { rng } from './rng.mjs';

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const rand = rng(12345);

for (const m of Object.values(MACHINES)) {
  // strips carry exactly the configured counts, on every reel
  m.strips.forEach((strip, r) => {
    for (const s of SYMBOLS) { const n = strip.filter((x) => x === SYM[s.id]).length; if (n !== (m.counts[s.id] || 0)) fail(`${m.id} reel ${r}: ${s.id} ×${n}, expected ${m.counts[s.id] || 0}`); }
  });
  if (m.lines.some((l) => l.length !== m.reels || l.some((row) => row < 0 || row >= m.rows))) fail(`${m.id}: a payline leaves the grid`);
  // forced wins read back correctly on every line
  m.lines.forEach((_, li) => {
    for (let n = 3; n <= m.reels; n++) {
      const g = gridFor(m, stopsShowing(m.id, li, 'snowball', n, rand)), w = evaluate(m, g).find((x) => x.line === li);
      if (!w || w.count !== n || w.sym !== SYM.snowball) fail(`${m.id} line ${li}: forced ${n} snowballs read as ${JSON.stringify(w)}`);
    }
  });
}

// Mini Hat: check EVERY possible set of reel stops against the exact PAR-sheet formula.
{
  const m = MACHINES.mini, L = m.stripLen; let total = 0, jack = 0;
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) {
    const w = evaluate(m, gridFor(m, [a, b, c])); total += w.reduce((s, x) => s + x.pay, 0); jack += w.filter((x) => x.jackpot).length;
  }
  const exact = total / L ** 3 / m.bet, s = stats(m);
  if (Math.abs(exact - s.fixedPerDollar) > 1e-9) fail(`Mini Hat: all-stops payback ${exact} ≠ formula ${s.fixedPerDollar}`);
  if (Math.abs(jack / L ** 3 - s.jackpotPerLine * s.lines) > 1e-12) fail('Mini Hat: jackpot line count mismatch');
  console.log(`Mini Hat: all ${L ** 3} reel stops checked; fixed payback matches the formula exactly.`);
}

// PAR-sheet numbers (exact) + per-pull numbers (simulated) for each machine.
for (const m of Object.values(MACHINES)) {
  const s = stats(m), N = 300000, st = { pool: 1e12 }; let hit = 0, ahead = 0, jp = 0, fixed = 0;
  for (let i = 0; i < N; i++) { const r = pull(st, m.id, rand); if (r.wins.length) hit++; if (r.ahead) ahead++; if (r.jackpot) jp++; fixed += r.wins.reduce((a, w) => a + w.pay, 0); }
  const sim = fixed / N / m.bet;
  if (Math.abs(sim - s.fixedPerDollar) > 0.05) fail(`${m.name}: simulated payback ${sim} far from exact ${s.fixedPerDollar}`);
  console.log(`${m.name} (${m.reels}×${m.rows}, ${s.lines} lines, $${m.bet.toFixed(2)}): fixed wins pay back ${(s.fixedPerDollar * 100).toFixed(1)}¢ per $1 (simulated ${(sim * 100).toFixed(1)}¢); ` +
    `a win on ${(hit / N * 100).toFixed(1)}% of pulls, ahead on ${(ahead / N * 100).toFixed(1)}%; jackpot about 1 in ${Math.round(N / Math.max(1, jp)).toLocaleString()} pulls; biggest fixed line win $${MAX_FIXED(m).toFixed(2)}`);
}

// Shared pool: long runs of both machines (30% Big Hat pulls). Pool never negative; jackpot never beyond the pool.
let paused = 0, capped = 0, jackpots = 0; const ends = [];
for (let run = 0; run < 200; run++) {
  const st = { pool: START_POOL };
  for (let i = 0; i < 20000; i++) {
    const mid = rand() < 0.3 ? 'big' : 'mini', before = st.pool, r = pull(st, mid, rand);
    if (r.paused) { paused++; continue; }
    if (r.capped) capped++;
    if (r.jackpot) jackpots++;
    if (r.pay > before + MACHINES[mid].bet * IN_PER_DOLLAR + 1e-9) fail('paid more than the pool held');
    if (st.pool < -1e-9) fail('pool went negative');
    if (Math.abs(r.received - r.pay * 0.97) > 1e-9) fail('winner should receive the pay minus 3%');
  }
  ends.push(st.pool);
}
ends.sort((a, b) => a - b);
console.log(`Shared pool, 200 runs × 20,000 pulls from $${START_POOL}: median end $${ends[100].toFixed(0)}, lowest $${ends[0].toFixed(0)}; ${jackpots} jackpots; ${paused} paused pulls; ${capped} capped wins`);
console.log('OK: strips, paylines, all-stops check, pool invariants');
