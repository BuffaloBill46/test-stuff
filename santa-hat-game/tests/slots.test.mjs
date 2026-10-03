// Santa Hat Slots rules: invariants asserted, plus the numbers a PAR sheet would list for the current (DRAFT) settings.
// Run: node tests/slots.test.mjs
import { MACHINES, SYMBOLS, SYM, IN_PER_DOLLAR, START_POOL, SKIM_AT, SKIM, POOL_RULES, MAX_FIXED, stats, gridFor, evaluate, pull, stopsShowing } from '../mockups/slots.js';
import { rng } from './rng.mjs';

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const rand = rng(12345);

for (const m of Object.values(MACHINES)) {
  // strips carry exactly the configured counts, on every reel
  m.strips.forEach((strip, r) => {
    for (const s of SYMBOLS) { const n = strip.filter((x) => x === SYM[s.id]).length; if (n !== (m.counts[s.id] || 0)) fail(`${m.id} reel ${r}: ${s.id} ×${n}, expected ${m.counts[s.id] || 0}`); }
  });
  if (m.lines.some((l) => l.length < 3 || l.length > m.reels || l.some((row) => row < 0 || row >= m.rows))) fail(`${m.id}: a payline leaves the grid or is too short`);
  // Cody's rule: every line is straight or diagonal (each step moves the same way: 0, +1 or −1 rows)
  m.lines.forEach((l, i) => { const d = l[1] - l[0]; if (Math.abs(d) > 1 || l.some((row, r) => r && row - l[r - 1] !== d)) fail(`${m.id}: line ${i + 1} is not straight or diagonal`); });
  // forced wins read back correctly on every line
  m.lines.forEach((_, li) => {
    for (let n = 3; n <= m.lines[li].length; n++) { // short diagonals only reach 3 or 4
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
  if (Math.abs(exact - s.linePayback) > 1e-9) fail(`3-reel check: all-stops line payback ${exact} ≠ formula ${s.linePayback}`);
  console.log(`Win reading: all ${(L ** 3).toLocaleString()} stops of a 3-reel test machine match the exact formula.`);
}
// Guards against a setting silently switching off (a stray comment once disabled the hat bonus without any error).
for (const m of Object.values(MACHINES)) {
  if (!(m.hatBonus > 0)) fail(`${m.id}: hat bonus is missing or zero`);
  if (!(m.poolJackpotOdds > 0) || !(m.jackpotPct > 0)) fail(`${m.id}: pool jackpot settings missing`);
  const s = stats(m); if (!(s.hatPayback > 0)) fail(`${m.id}: hat bonus contributes nothing`);
  if (s.payback < 0.76 || s.payback > 0.83) fail(`${m.id}: payback ${(s.payback * 100).toFixed(1)}% is outside 76–83% (Cody, 2026-09-30: around 80%)`);
}
// No reel strip has two Santa Hats next to each other, so the reels alone can never show a full grid of hats.
for (const m of Object.values(MACHINES)) m.strips.forEach((st, r) => st.forEach((x, i) => { if (x === SYM.hat && st[(i + 1) % st.length] === SYM.hat) fail(`${m.id} reel ${r}: two hats in a row at ${i}`); }));

// PAR-sheet numbers (exact) + per-pull numbers (simulated) for each machine.
for (const m of Object.values(MACHINES)) {
  const s = stats(m), N = 300000, st = { pool: 1e12 }; let hit = 0, ahead = 0, micro = 0, jp = 0, top = 0, fixed = 0;
  for (let i = 0; i < N; i++) {
    const r = pull(st, m.id, rand); if (r.jackpot) { jp++; if (!r.grid.flat().every((x) => x === SYM.hat)) fail('pool jackpot must show a full grid of hats'); continue; }
    const pay = r.pay; fixed += pay; if (r.wins.some((w) => w.top)) top++;
    if (Math.abs(r.hatPay - r.hats * m.hatBonus * m.bet) > 1e-12) fail('hat bonus should be hatBonus × the price per Santa Hat on the grid');
    if (pay > 0) hit++; if (pay > m.bet + 1e-9) ahead++; else if (pay > 0) micro++;
  }
  const sim = fixed / (N - jp) / m.bet;
  if (Math.abs(sim - s.payback) > 0.05) fail(`${m.name}: simulated payback ${sim} far from exact ${s.payback}`);
  console.log(`${m.name} (${m.reels}×${m.rows}, ${s.lines} lines, $${m.bet.toFixed(2)}): pays back ${(s.payback * 100).toFixed(1)}% (lines ${(s.linePayback * 100).toFixed(1)}% + hat bonus ${(s.hatPayback * 100).toFixed(1)}%; simulated ${(sim * 100).toFixed(1)}%); ` +
    `a win on ${(hit / N * 100).toFixed(1)}% of pulls (micro ${(micro / N * 100).toFixed(1)}%, ahead ${(ahead / N * 100).toFixed(1)}%); ` +
    `100× line about 1 in ${Math.round(1 / (s.topPerLine * s.lines)).toLocaleString()}; pool jackpot about 1 in ${Math.round(N / Math.max(1, jp)).toLocaleString()} (set 1 in ${Math.round(1 / m.poolJackpotOdds).toLocaleString()})`);
}

// Big Hat alone on the Game pool over long runs: never negative, never pays beyond the pool, skims $25 to the treasury at $1,025.
let paused = 0, capped = 0, jackpots = 0, skims = 0, topOffs = 0, lowest = Infinity; const ends = [], jackAmts = []; let treasuryNet = 0;
for (let run = 0; run < 200; run++) {
  const st = { pool: START_POOL };
  for (let i = 0; i < 20000; i++) {
    const before = st.pool, r = pull(st, 'big', rand);
    if (r.paused) { paused++; continue; }
    if (r.capped) capped++;
    if (r.jackpot) { jackpots++; jackAmts.push(r.pay);
      // the pool jackpot = 25% of the pool AT THAT MOMENT (after this pull's entry), recorded with the result for re-checks
      if (Math.abs(r.jackpotPool - (before + (r.topOff && before < POOL_RULES.topOffBelow ? POOL_RULES.topOffTo - before : 0) + MACHINES.big.bet * IN_PER_DOLLAR)) > 1e-9) fail('jackpot must record the pool at that moment');
      if (r.pay !== r.jackpotPool * 0.25 || r.pct !== 0.25) fail('the pool jackpot must pay exactly 25% of the recorded pool'); }
    if (r.topOff) { topOffs++; if (Math.abs(st.pool - POOL_RULES.topOffTo) > 1e-9) fail('top-off should bring the pool to topOffTo'); }
    if (st.pool < POOL_RULES.topOffBelow - 1e-9) fail('pool left below the top-off level');
    lowest = Math.min(lowest, st.pool);
    if (r.skim) { skims++; if (st.pool < SKIM_AT - SKIM - 1e-9 || st.pool >= SKIM_AT) fail('skim left the pool out of range'); }
    if (st.pool >= SKIM_AT) fail('pool should never sit at or above the skim point');
    if (r.pay > before + MACHINES.big.bet * IN_PER_DOLLAR + 1e-9) fail('paid more than the pool held');
    if (st.pool < -1e-9) fail('pool went negative');
    if (Math.abs(r.received - r.pay * 0.97) > 1e-9) fail('winner should receive the pay minus 3%');
  }
  ends.push(st.pool); treasuryNet += st.treasury || 0;
}
if (paused) fail(`${paused} pulls refused: with the top-off the game must never lock`);
if (!jackpots) fail('no pool jackpot in 4 million pulls: the jackpot check above checked nothing');
// ONE GAME POOL (Cody, 2026-10-02): Slots plays by the shared pool's rules, the same object as the Drop/Stocking pool's
{ const { SPIN_RULES } = await import('../mockups/spin.js');
  if (SPIN_RULES !== POOL_RULES) fail('the Slots and Drop/Stocking pool rules must be ONE object (one shared pool)');
  const want = { start: 500, skimAt: 1025, skim: 25, topOffBelow: 200, topOffTo: 500, paused: false };
  if (JSON.stringify(POOL_RULES) !== JSON.stringify(want)) fail(`the Game pool rules must be Cody's: ${JSON.stringify(want)}`); }
ends.sort((a, b) => a - b); jackAmts.sort((a, b) => a - b);
console.log(`Slots pool, 200 runs × 20,000 pulls from $${START_POOL}: median end $${ends[100].toFixed(0)}, lowest after any pull $${lowest.toFixed(0)}; ${skims} skims of $${SKIM}; ${topOffs} top-offs; treasury net about $${(treasuryNet / 200).toFixed(0)} per 20,000 pulls; ${jackpots} pool jackpots (median $${(jackAmts[jackAmts.length >> 1] || 0).toFixed(2)}); ${paused} paused pulls; ${capped} capped wins`);
// Stress: start the pool low so the top-off has to work. It must fire, and no pull may ever be refused.
{
  let tops = 0, refused = 0, sent = 0;
  for (let run = 0; run < 100; run++) {
    const st = { pool: run % 2 ? 120 : 50, treasury: 0 }; // $50 is under the $100 top prize: the top-off must run before the first pull
    for (let i = 0; i < 5000; i++) { const r = pull(st, 'big', rand); if (r.paused) refused++; if (r.topOff) tops++; if (st.pool < POOL_RULES.topOffBelow - 1e-9) fail('stress: pool below top-off level'); }
    sent += Math.min(0, st.treasury);
  }
  if (!tops) fail('stress: the top-off never fired');
  if (refused) fail(`stress: ${refused} pulls refused even with the top-off`);
  console.log(`Top-off stress (pool starting at $50 or $120): ${tops} top-offs in 100 runs, 0 refused pulls.`);
}
// Emergency stop: paused means no pull and no top-off, even with an empty pool.
{
  const st = { pool: 20, treasury: 0, rules: { paused: true } }, r = pull(st, 'big', rand);
  if (!r.paused || !r.stopped || st.pool !== 20 || st.treasury !== 0) fail('paused pool must refuse pulls and must not top off');
  st.rules.paused = false; const r2 = pull(st, 'big', rand);
  if (r2.paused || !r2.topOff) fail('after un-pausing, the top-off should refill the pool and the pull should run');
  console.log('Emergency stop: paused pool refused the pull and did not top off; un-paused, it topped off and played.');
}
console.log('OK: strips, paylines, all-stops check, pool invariants');
