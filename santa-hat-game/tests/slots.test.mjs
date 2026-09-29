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
      if (!(n in m.pays.snowball)) continue;
      if (!w || w.count !== n || w.sym !== SYM.snowball) fail(`${m.id} line ${li}: forced ${n} snowballs read as ${JSON.stringify(w)}`);
    }
  });
}

// Mini Hat: check EVERY possible set of reel stops against the exact PAR-sheet formula.
{
  const m = MACHINES.mini, L = m.stripLen; let total = 0, top = 0, fullGrid = 0;
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) {
    const g = gridFor(m, [a, b, c]), w = evaluate(m, g); total += w.reduce((s, x) => s + x.pay, 0); top += w.filter((x) => x.top).length;
    if (g.every((col) => col.every((x) => x === SYM.hat))) fullGrid++;
  }
  const exact = total / L ** 3 / m.bet, s = stats(m);
  if (Math.abs(exact - s.payback) > 1e-9) fail(`Mini Hat: all-stops payback ${exact} ≠ formula ${s.payback}`);
  if (Math.abs(top / L ** 3 - s.topPerLine * s.lines) > 1e-12) fail('Mini Hat: 100× line count mismatch');
  if (fullGrid) fail('Mini Hat: reel stops alone produced a full grid of hats (that must only come from the pool jackpot)');
  console.log(`Mini Hat: all ${L ** 3} reel stops checked; payback matches the formula exactly; no full grid of hats from the reels.`);
}

// PAR-sheet numbers (exact) + per-pull numbers (simulated) for each machine.
for (const m of Object.values(MACHINES)) {
  const s = stats(m), N = 300000, st = { pool: 1e12 }; let hit = 0, ahead = 0, micro = 0, jp = 0, top = 0, fixed = 0;
  for (let i = 0; i < N; i++) {
    const r = pull(st, m.id, rand); if (r.jackpot) { jp++; if (!r.grid.flat().every((x) => x === SYM.hat)) fail('pool jackpot must show a full grid of hats'); continue; }
    const pay = r.wins.reduce((a, w) => a + w.pay, 0); fixed += pay; if (r.wins.some((w) => w.top)) top++;
    if (r.wins.length) hit++; if (pay > m.bet + 1e-9) ahead++; else if (pay > 0) micro++;
  }
  const sim = fixed / (N - jp) / m.bet;
  if (Math.abs(sim - s.payback) > 0.05) fail(`${m.name}: simulated payback ${sim} far from exact ${s.payback}`);
  console.log(`${m.name} (${m.reels}×${m.rows}, ${s.lines} lines, $${m.bet.toFixed(2)}): line wins pay back ${(s.payback * 100).toFixed(1)}% (simulated ${(sim * 100).toFixed(1)}%); ` +
    `a win on ${(hit / N * 100).toFixed(1)}% of pulls (micro ${(micro / N * 100).toFixed(1)}%, ahead ${(ahead / N * 100).toFixed(1)}%); ` +
    `100× line about 1 in ${Math.round(1 / (s.topPerLine * s.lines)).toLocaleString()}; pool jackpot about 1 in ${Math.round(N / Math.max(1, jp)).toLocaleString()} (set 1 in ${Math.round(1 / m.poolJackpotOdds).toLocaleString()})`);
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
