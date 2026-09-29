// Santa Hat Slots rules: invariants asserted, plus the numbers a PAR sheet would list for the current (DRAFT) settings.
// Run: node tests/slots.test.mjs
import { MACHINES, SYMBOLS, SYM, IN_PER_DOLLAR, START_POOL, SKIM_AT, SKIM, MAX_FIXED, stats, gridFor, evaluate, pull, stopsShowing } from '../mockups/slots.js';
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

// Exhaustive check of the win-reading code: a 3-reel copy of the Big Hat (same strips, same pays for 2–3 in a row,
// middle row + diagonals) has few enough stop combinations to check every one against the exact PAR-sheet formula.
// (The full 5-reel Big Hat has 45^5 ≈ 184 million, so it's checked by simulation below instead.)
{
  const B = MACHINES.big, m = { ...B, reels: 3, rows: 3, lines: [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]], strips: B.strips.slice(0, 3),
    pays: Object.fromEntries(Object.entries(B.pays).map(([id, p]) => [id, { 3: p[3] }])) };
  const L = m.stripLen; let total = 0;
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) for (let c = 0; c < L; c++) total += evaluate(m, gridFor(m, [a, b, c])).reduce((s, x) => s + x.pay, 0);
  const exact = total / L ** 3 / m.bet, s = stats(m);
  if (Math.abs(exact - s.payback) > 1e-9) fail(`3-reel check: all-stops payback ${exact} ≠ formula ${s.payback}`);
  console.log(`Win reading: all ${(L ** 3).toLocaleString()} stops of a 3-reel test machine match the exact formula.`);
}
// No reel strip has two Santa Hats next to each other, so the reels alone can never show a full grid of hats.
for (const m of Object.values(MACHINES)) m.strips.forEach((st, r) => st.forEach((x, i) => { if (x === SYM.hat && st[(i + 1) % st.length] === SYM.hat) fail(`${m.id} reel ${r}: two hats in a row at ${i}`); }));

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

// Slots pool over long runs: never negative, never pays beyond the pool, skims $25 to the treasury at $325.
let paused = 0, capped = 0, jackpots = 0, skims = 0; const ends = [], jackAmts = [];
for (let run = 0; run < 200; run++) {
  const st = { pool: START_POOL };
  for (let i = 0; i < 20000; i++) {
    const before = st.pool, r = pull(st, 'big', rand);
    if (r.paused) { paused++; continue; }
    if (r.capped) capped++;
    if (r.jackpot) { jackpots++; jackAmts.push(r.pay); }
    if (r.skim) { skims++; if (st.pool < SKIM_AT - SKIM - 1e-9 || st.pool >= SKIM_AT) fail('skim left the pool out of range'); }
    if (st.pool >= SKIM_AT) fail('pool should never sit at or above the skim point');
    if (r.pay > before + MACHINES.big.bet * IN_PER_DOLLAR + 1e-9) fail('paid more than the pool held');
    if (st.pool < -1e-9) fail('pool went negative');
    if (Math.abs(r.received - r.pay * 0.97) > 1e-9) fail('winner should receive the pay minus 3%');
  }
  ends.push(st.pool);
}
ends.sort((a, b) => a - b); jackAmts.sort((a, b) => a - b);
console.log(`Slots pool, 200 runs × 20,000 pulls from $${START_POOL}: median end $${ends[100].toFixed(0)}, lowest $${ends[0].toFixed(0)}; ${skims} skims of $${SKIM}; ${jackpots} pool jackpots (median $${(jackAmts[jackAmts.length >> 1] || 0).toFixed(2)}); ${paused} paused pulls; ${capped} capped wins`);
console.log('OK: strips, paylines, all-stops check, pool invariants');
